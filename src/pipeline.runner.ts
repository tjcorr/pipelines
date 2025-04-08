import * as core from '@actions/core';
import * as azdev from "azure-devops-node-api";
import fetch from 'node-fetch';
import { TaskParameters } from './task.parameters';
import { PipelineNotFoundError } from './pipeline.error';

import * as ReleaseInterfaces from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import * as BuildInterfaces from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { PipelineHelper as p } from './util/pipeline.helper';
import { Logger as log, Logger } from './util/logger';
import { UrlParser } from './util/url.parser';
import { LogicalOperation } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';

export class PipelineRunner {
    public taskParameters: TaskParameters;
    readonly repository = p.processEnv("GITHUB_REPOSITORY");
    readonly branch = p.processEnv("GITHUB_REF");
    readonly commitId = p.processEnv("GITHUB_SHA");
    readonly githubRepo = "GitHub";

    constructor(taskParameters: TaskParameters) {
        this.taskParameters = taskParameters
    }

    public async start(): Promise<any> {
        try {
            var taskParams = TaskParameters.getTaskParams();
            let authHandler = azdev.getPersonalAccessTokenHandler(taskParams.azureDevopsToken);
            let collectionUrl = UrlParser.GetCollectionUrlBase(this.taskParameters.azureDevopsProjectUrl);
            core.info(`Creating connection with Azure DevOps service : "${collectionUrl}"`)
            let webApi = new azdev.WebApi(collectionUrl, authHandler);
            core.info("Connection created");
            
            try {
                if (this.taskParameters.azurePipelineId) {
                    // If pipeline ID is specified, use it directly
                    core.debug(`Triggering pipeline with ID : "${this.taskParameters.azurePipelineId}"`);
                    await this.RunYamlPipelineById(webApi);
                } else {
                    // Fallback to using pipeline name
                    let pipelineName = this.taskParameters.azurePipelineName;
                    core.debug(`Triggering Yaml pipeline by name : "${pipelineName}"`);
                    await this.RunYamlPipeline(webApi);
                }
            }
            catch (error) {
                if (error instanceof PipelineNotFoundError) {
                    // Try Designer pipeline
                    if (this.taskParameters.azurePipelineId) {
                        // Try to find designer pipeline by ID
                        core.debug(`Triggering Designer pipeline with ID: "${this.taskParameters.azurePipelineId}"`);
                        await this.RunDesignerPipelineById(webApi);
                    } else if (this.taskParameters.azurePipelineName) {
                        // Try to find designer pipeline by name
                        core.debug(`Triggering Designer pipeline by name: "${this.taskParameters.azurePipelineName}"`);
                        await this.RunDesignerPipeline(webApi);
                    } else {
                        throw new Error(`Pipeline with ID ${this.taskParameters.azurePipelineId} not found`);
                    }
                } else {
                    throw error;
                }
            }
        } catch (error) {
            let errorMessage: string = `${error.message}`;
            core.setFailed(errorMessage);
        }
    }

    public async RunYamlPipelineById(webApi: azdev.WebApi): Promise<any> {
        let projectName = UrlParser.GetProjectName(this.taskParameters.azureDevopsProjectUrl);
        let buildDefinitionId = parseInt(this.taskParameters.azurePipelineId);
        let buildApi = await webApi.getBuildApi();

        // Get build definition for the specified definition Id
        try {
            let buildDefinition = await buildApi.getDefinition(projectName, buildDefinitionId);
            if (!buildDefinition) {
                throw new PipelineNotFoundError(`Pipeline with ID "${buildDefinitionId}" not found in project "${projectName}"`);
            }
            
            log.LogPipelineObject(buildDefinition);
            
            // Call the private method to trigger the pipeline
            await this._triggerPipeline(webApi, projectName, buildDefinitionId, buildDefinition);
        } catch (error) {
            if (error.statusCode === 404) {
                throw new PipelineNotFoundError(`Pipeline with ID "${buildDefinitionId}" not found in project "${projectName}"`);
            }
            throw error;
        }
    }

    public async RunYamlPipeline(webApi: azdev.WebApi): Promise<any> {
        let projectName = UrlParser.GetProjectName(this.taskParameters.azureDevopsProjectUrl);
        let pipelineName = this.taskParameters.azurePipelineName;
        let buildApi = await webApi.getBuildApi();

        // Get matching build definitions for the given project and pipeline name
        const buildDefinitions = await buildApi.getDefinitions(projectName, pipelineName);

        p.EnsureValidPipeline(projectName, pipelineName, buildDefinitions);

        // Extract Id from build definition
        let buildDefinitionReference: BuildInterfaces.BuildDefinitionReference = buildDefinitions[0];
        let buildDefinitionId = buildDefinitionReference.id;

        // Get build definition for the matching definition Id
        let buildDefinition = await buildApi.getDefinition(projectName, buildDefinitionId);

        log.LogPipelineObject(buildDefinition);
        
        // Call the private method to trigger the pipeline
        await this._triggerPipeline(webApi, projectName, buildDefinitionId, buildDefinition);
    }

    private async _triggerPipeline(webApi: azdev.WebApi, projectName: string, buildDefinitionId: number, buildDefinition: BuildInterfaces.BuildDefinition): Promise<any> {
        // Fetch repository details from build definition
        let repositoryId = buildDefinition.repository.id.trim();
        let repositoryType = buildDefinition.repository.type.trim();
        let sourceBranch = null;
        let sourceVersion = null;

        // Check if source branch and version are provided as input parameters
        if (this.taskParameters.sourceBranch) {
            sourceBranch = this.taskParameters.sourceBranch;
            core.debug(`Using provided source branch: ${sourceBranch}`);
        }

        if (this.taskParameters.sourceVersion) {
            sourceVersion = this.taskParameters.sourceVersion;
            core.debug(`Using provided source version: ${sourceVersion}`);
        }

        // If not overridden and definition is linked to existing github repo,
        // pass github source branch and source version to build
        if ((sourceBranch === null || sourceVersion === null) &&
            p.equals(repositoryId, this.repository) && p.equals(repositoryType, this.githubRepo)) {
            core.debug("pipeline is linked to same Github repo");
            if (sourceBranch === null) {
                sourceBranch = this.branch;
                core.debug(`Using default GitHub branch: ${sourceBranch}`);
            }
            if (sourceVersion === null) {
                sourceVersion = this.commitId;
                core.debug(`Using default GitHub commit SHA: ${sourceVersion}`);
            }
        } else if (sourceBranch === null && sourceVersion === null) {
            core.debug("pipeline is not linked to same Github repo and no source parameters provided");
        }

        // Create the request body for the Pipelines API
        const resources: any = {};
        
        // Set up repository resources if needed
        if (sourceBranch !== null && sourceVersion !== null) {
            resources.repositories = {
                self: {
                    refName: sourceBranch,
                    version: sourceVersion
                }
            };
        }

        // Set template parameters and variables
        const pipelineParameters: any = {};
        if (this.taskParameters.azureTemplateParameters) {
            pipelineParameters.templateParameters = this.taskParameters.azureTemplateParameters;
        }
        if (this.taskParameters.azurePipelineVariables) {
            pipelineParameters.variables = {};
            const variables = JSON.parse(this.taskParameters.azurePipelineVariables);
            Object.keys(variables).forEach(key => {
                pipelineParameters.variables[key] = {
                    value: variables[key]
                };
            });
        }

        // Add resources if defined
        if (Object.keys(resources).length > 0) {
            pipelineParameters.resources = resources;
        }

        log.LogPipelineTriggerInput(pipelineParameters);

        // Make a direct REST API call to trigger the pipeline
        const pipelinesUrl = `${webApi.serverUrl}/${projectName}/_apis/pipelines/${buildDefinitionId}/runs?api-version=7.1`;
        
        // Get token directly from task parameters
        const token = this.taskParameters.azureDevopsToken;
        
        // Create headers for our request
        const headers = {
            'Authorization': `Basic ${Buffer.from(':' + token).toString('base64')}`,
            'Content-Type': 'application/json'
        };

        // Make the REST call to run the pipeline
        const response = await fetch(pipelinesUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(pipelineParameters)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to trigger pipeline: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const pipelineRunResult = await response.json()
        log.LogPipelineTriggerOutput(pipelineRunResult);
        
        if (pipelineRunResult) {
            // Use pipeline name if available, otherwise use ID
            const displayName = this.taskParameters.azurePipelineName || `ID: ${buildDefinitionId}`;
            log.LogPipelineTriggered(displayName, projectName);
            if (pipelineRunResult._links && pipelineRunResult._links.web) {
                log.LogOutputUrl(pipelineRunResult._links.web.href);
            }
        }
    }

    public async RunDesignerPipelineById(webApi: azdev.WebApi): Promise<any> {
        let projectName = UrlParser.GetProjectName(this.taskParameters.azureDevopsProjectUrl);
        let releaseDefinitionId = parseInt(this.taskParameters.azurePipelineId);
        let releaseApi = await webApi.getReleaseApi();

        // Get release definition for the specified definition Id
        try {
            let releaseDefinition = await releaseApi.getReleaseDefinition(projectName, releaseDefinitionId);
            if (!releaseDefinition) {
                throw new PipelineNotFoundError(`Release pipeline with ID "${releaseDefinitionId}" not found in project "${projectName}"`);
            }

            // Call the private method to trigger the designer pipeline
            const displayName = `ID: ${releaseDefinitionId}`;
            await this._triggerDesignerPipeline(webApi, projectName, releaseDefinition, displayName);
        } catch (error) {
            if (error.statusCode === 404) {
                throw new PipelineNotFoundError(`Release pipeline with ID "${releaseDefinitionId}" not found in project "${projectName}"`);
            }
            throw error;
        }
    }

    public async RunDesignerPipeline(webApi: azdev.WebApi): Promise<any> {
        let projectName = UrlParser.GetProjectName(this.taskParameters.azureDevopsProjectUrl);
        let pipelineName = this.taskParameters.azurePipelineName;
        let releaseApi = await webApi.getReleaseApi();
        
        // Get release definitions for the given project name and pipeline name
        const releaseDefinitions: ReleaseInterfaces.ReleaseDefinition[] = await releaseApi.getReleaseDefinitions(projectName, pipelineName, ReleaseInterfaces.ReleaseDefinitionExpands.Artifacts);

        p.EnsureValidPipeline(projectName, pipelineName, releaseDefinitions);

        let releaseDefinition = releaseDefinitions[0];

        // Call the private method to trigger the designer pipeline
        await this._triggerDesignerPipeline(webApi, projectName, releaseDefinition, pipelineName);
    }

    private async _triggerDesignerPipeline(webApi: azdev.WebApi, projectName: string, releaseDefinition: ReleaseInterfaces.ReleaseDefinition, displayName: string): Promise<any> {
        log.LogPipelineObject(releaseDefinition);

        // Create ConfigurationVariableValue objects from the input variables
        let variables = undefined;
        if (this.taskParameters.azurePipelineVariables) {
            variables = JSON.parse(this.taskParameters.azurePipelineVariables);
            Object.keys(variables).map(function (key, index) {
                let oldValue = variables[key];
                variables[key] = { value: oldValue };
            });
        }

        // Filter Github artifacts from release definition
        let gitHubArtifacts = releaseDefinition.artifacts.filter(p.isGitHubArtifact);
        let artifacts: ReleaseInterfaces.ArtifactMetadata[] = new Array();

        if (gitHubArtifacts == null || gitHubArtifacts.length == 0) {
            core.debug("Pipeline is not linked to any GitHub artifact");
            // If no GitHub artifacts found it means pipeline is not linked to any GitHub artifact
        } else {
            // If pipeline has any matching Github artifact
            core.debug("Pipeline is linked to GitHub artifact. Looking for now matching repository");
            gitHubArtifacts.forEach(gitHubArtifact => {
                if (gitHubArtifact.definitionReference != null && p.equals(gitHubArtifact.definitionReference.definition.name, this.repository)) {
                    // Prepare branch and version info
                    let branchToUse = this.taskParameters.sourceBranch || this.branch;
                    let versionToUse = this.taskParameters.sourceVersion || this.commitId;
                    
                    // Add version information for matching GitHub artifact
                    let artifactMetadata = <ReleaseInterfaces.ArtifactMetadata>{
                        alias: gitHubArtifact.alias,
                        instanceReference: <ReleaseInterfaces.BuildVersion>{
                            id: versionToUse,
                            sourceBranch: branchToUse,
                            sourceRepositoryType: this.githubRepo,
                            sourceRepositoryId: this.repository,
                            sourceVersion: versionToUse
                        }
                    };
                    core.debug(`pipeline is linked to same Github repo, using branch: ${branchToUse}, version: ${versionToUse}`);
                    artifacts.push(artifactMetadata);
                }
            });
        }

        let releaseStartMetadata: ReleaseInterfaces.ReleaseStartMetadata = <ReleaseInterfaces.ReleaseStartMetadata>{
            definitionId: releaseDefinition.id,
            reason: ReleaseInterfaces.ReleaseReason.ContinuousIntegration,
            artifacts: artifacts,
            variables: variables
        };

        log.LogPipelineTriggerInput(releaseStartMetadata);
        
        // Get release API
        let releaseApi = await webApi.getReleaseApi();
        
        // Create release
        let release = await releaseApi.createRelease(releaseStartMetadata, projectName);
        
        if (release != null) {
            log.LogPipelineTriggered(displayName, projectName);
            log.LogPipelineTriggerOutput(release);
            if (release != null && release._links != null) {
                log.LogOutputUrl(release._links.web.href);
            }
        }
    }
}


// TODO template parameters for designer pipelines ? is this a thing
//      seems like it is not supported in the API
// support source branch and source version
// support pipeline id
// write tests for all the above
// add better IT for designer pipelines