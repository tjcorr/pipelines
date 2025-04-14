"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineRunner = void 0;
const core = __importStar(require("@actions/core"));
const azdev = __importStar(require("azure-devops-node-api"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const task_parameters_1 = require("./task.parameters");
const pipeline_error_1 = require("./pipeline.error");
const ReleaseInterfaces = __importStar(require("azure-devops-node-api/interfaces/ReleaseInterfaces"));
const pipeline_helper_1 = require("./util/pipeline.helper");
const logger_1 = require("./util/logger");
const url_parser_1 = require("./util/url.parser");
class PipelineRunner {
    constructor(taskParameters) {
        this.repository = pipeline_helper_1.PipelineHelper.processEnv("GITHUB_REPOSITORY");
        this.branch = pipeline_helper_1.PipelineHelper.processEnv("GITHUB_REF");
        this.commitId = pipeline_helper_1.PipelineHelper.processEnv("GITHUB_SHA");
        this.githubRepo = "GitHub";
        this.taskParameters = taskParameters;
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                var taskParams = task_parameters_1.TaskParameters.getTaskParams();
                let authHandler = azdev.getPersonalAccessTokenHandler(taskParams.azureDevopsToken);
                let collectionUrl = url_parser_1.UrlParser.GetCollectionUrlBase(this.taskParameters.azureDevopsProjectUrl);
                core.info(`Creating connection with Azure DevOps service : "${collectionUrl}"`);
                let webApi = new azdev.WebApi(collectionUrl, authHandler);
                core.info("Connection created");
                try {
                    if (this.taskParameters.azurePipelineId) {
                        // If pipeline ID is specified, use it directly
                        core.debug(`Triggering pipeline with ID : "${this.taskParameters.azurePipelineId}"`);
                        yield this.RunYamlPipelineById(webApi);
                    }
                    else {
                        // Fallback to using pipeline name
                        let pipelineName = this.taskParameters.azurePipelineName;
                        core.debug(`Triggering Yaml pipeline by name : "${pipelineName}"`);
                        yield this.RunYamlPipeline(webApi);
                    }
                }
                catch (error) {
                    if (error instanceof pipeline_error_1.PipelineNotFoundError) {
                        // Try Designer pipeline
                        if (this.taskParameters.azurePipelineId) {
                            // Try to find designer pipeline by ID
                            core.debug(`Triggering Designer pipeline with ID: "${this.taskParameters.azurePipelineId}"`);
                            yield this.RunDesignerPipelineById(webApi);
                        }
                        else if (this.taskParameters.azurePipelineName) {
                            // Try to find designer pipeline by name
                            core.debug(`Triggering Designer pipeline by name: "${this.taskParameters.azurePipelineName}"`);
                            yield this.RunDesignerPipeline(webApi);
                        }
                        else {
                            throw new Error(`Pipeline with ID ${this.taskParameters.azurePipelineId} not found`);
                        }
                    }
                    else {
                        throw error;
                    }
                }
            }
            catch (error) {
                let errorMessage = `${error.message}`;
                core.setFailed(errorMessage);
            }
        });
    }
    RunYamlPipelineById(webApi) {
        return __awaiter(this, void 0, void 0, function* () {
            let projectName = url_parser_1.UrlParser.GetProjectName(this.taskParameters.azureDevopsProjectUrl);
            let buildDefinitionId = parseInt(this.taskParameters.azurePipelineId);
            let buildApi = yield webApi.getBuildApi();
            // Get build definition for the specified definition Id
            try {
                let buildDefinition = yield buildApi.getDefinition(projectName, buildDefinitionId);
                if (!buildDefinition) {
                    throw new pipeline_error_1.PipelineNotFoundError(`Pipeline with ID "${buildDefinitionId}" not found in project "${projectName}"`);
                }
                logger_1.Logger.LogPipelineObject(buildDefinition);
                // Call the private method to trigger the pipeline
                yield this._triggerPipeline(webApi, projectName, buildDefinitionId, buildDefinition);
            }
            catch (error) {
                if (error.statusCode === 404) {
                    throw new pipeline_error_1.PipelineNotFoundError(`Pipeline with ID "${buildDefinitionId}" not found in project "${projectName}"`);
                }
                throw error;
            }
        });
    }
    RunYamlPipeline(webApi) {
        return __awaiter(this, void 0, void 0, function* () {
            let projectName = url_parser_1.UrlParser.GetProjectName(this.taskParameters.azureDevopsProjectUrl);
            let pipelineName = this.taskParameters.azurePipelineName;
            let buildApi = yield webApi.getBuildApi();
            // Get matching build definitions for the given project and pipeline name
            const buildDefinitions = yield buildApi.getDefinitions(projectName, pipelineName);
            pipeline_helper_1.PipelineHelper.EnsureValidPipeline(projectName, pipelineName, buildDefinitions);
            // Extract Id from build definition
            let buildDefinitionReference = buildDefinitions[0];
            let buildDefinitionId = buildDefinitionReference.id;
            // Get build definition for the matching definition Id
            let buildDefinition = yield buildApi.getDefinition(projectName, buildDefinitionId);
            logger_1.Logger.LogPipelineObject(buildDefinition);
            // Call the private method to trigger the pipeline
            yield this._triggerPipeline(webApi, projectName, buildDefinitionId, buildDefinition);
        });
    }
    _triggerPipeline(webApi, projectName, buildDefinitionId, buildDefinition) {
        return __awaiter(this, void 0, void 0, function* () {
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
                pipeline_helper_1.PipelineHelper.equals(repositoryId, this.repository) && pipeline_helper_1.PipelineHelper.equals(repositoryType, this.githubRepo)) {
                core.debug("pipeline is linked to same Github repo");
                if (sourceBranch === null) {
                    sourceBranch = this.branch;
                    core.debug(`Using default GitHub branch: ${sourceBranch}`);
                }
                if (sourceVersion === null) {
                    sourceVersion = this.commitId;
                    core.debug(`Using default GitHub commit SHA: ${sourceVersion}`);
                }
            }
            else if (sourceBranch === null && sourceVersion === null) {
                core.debug("pipeline is not linked to same Github repo and no source parameters provided");
            }
            // Create the request body for the Pipelines API
            const resources = {};
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
            const pipelineParameters = {};
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
            logger_1.Logger.LogPipelineTriggerInput(pipelineParameters);
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
            const response = yield (0, node_fetch_1.default)(pipelinesUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(pipelineParameters)
            });
            if (!response.ok) {
                const errorText = yield response.text();
                throw new Error(`Failed to trigger pipeline: ${response.status} ${response.statusText} - ${errorText}`);
            }
            const pipelineRunResult = yield response.json();
            logger_1.Logger.LogPipelineTriggerOutput(pipelineRunResult);
            if (pipelineRunResult) {
                // Use pipeline name if available, otherwise use ID
                const displayName = this.taskParameters.azurePipelineName || `ID: ${buildDefinitionId}`;
                logger_1.Logger.LogPipelineTriggered(displayName, projectName);
                if (pipelineRunResult._links && pipelineRunResult._links.web) {
                    logger_1.Logger.LogOutputUrl(pipelineRunResult._links.web.href);
                }
            }
        });
    }
    RunDesignerPipelineById(webApi) {
        return __awaiter(this, void 0, void 0, function* () {
            let projectName = url_parser_1.UrlParser.GetProjectName(this.taskParameters.azureDevopsProjectUrl);
            let releaseDefinitionId = parseInt(this.taskParameters.azurePipelineId);
            let releaseApi = yield webApi.getReleaseApi();
            // Get release definition for the specified definition Id
            try {
                let releaseDefinition = yield releaseApi.getReleaseDefinition(projectName, releaseDefinitionId);
                if (!releaseDefinition) {
                    throw new pipeline_error_1.PipelineNotFoundError(`Release pipeline with ID "${releaseDefinitionId}" not found in project "${projectName}"`);
                }
                // Call the private method to trigger the designer pipeline
                const displayName = `ID: ${releaseDefinitionId}`;
                yield this._triggerDesignerPipeline(webApi, projectName, releaseDefinition, displayName);
            }
            catch (error) {
                if (error.statusCode === 404) {
                    throw new pipeline_error_1.PipelineNotFoundError(`Release pipeline with ID "${releaseDefinitionId}" not found in project "${projectName}"`);
                }
                throw error;
            }
        });
    }
    RunDesignerPipeline(webApi) {
        return __awaiter(this, void 0, void 0, function* () {
            let projectName = url_parser_1.UrlParser.GetProjectName(this.taskParameters.azureDevopsProjectUrl);
            let pipelineName = this.taskParameters.azurePipelineName;
            let releaseApi = yield webApi.getReleaseApi();
            // Get release definitions for the given project name and pipeline name
            const releaseDefinitions = yield releaseApi.getReleaseDefinitions(projectName, pipelineName, ReleaseInterfaces.ReleaseDefinitionExpands.Artifacts);
            pipeline_helper_1.PipelineHelper.EnsureValidPipeline(projectName, pipelineName, releaseDefinitions);
            let releaseDefinition = releaseDefinitions[0];
            // Call the private method to trigger the designer pipeline
            yield this._triggerDesignerPipeline(webApi, projectName, releaseDefinition, pipelineName);
        });
    }
    _triggerDesignerPipeline(webApi, projectName, releaseDefinition, displayName) {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.Logger.LogPipelineObject(releaseDefinition);
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
            let gitHubArtifacts = releaseDefinition.artifacts.filter(pipeline_helper_1.PipelineHelper.isGitHubArtifact);
            let artifacts = new Array();
            if (gitHubArtifacts == null || gitHubArtifacts.length == 0) {
                core.debug("Pipeline is not linked to any GitHub artifact");
                // If no GitHub artifacts found it means pipeline is not linked to any GitHub artifact
            }
            else {
                // If pipeline has any matching Github artifact
                core.debug("Pipeline is linked to GitHub artifact. Looking for now matching repository");
                gitHubArtifacts.forEach(gitHubArtifact => {
                    if (gitHubArtifact.definitionReference != null && pipeline_helper_1.PipelineHelper.equals(gitHubArtifact.definitionReference.definition.name, this.repository)) {
                        // Prepare branch and version info
                        let branchToUse = this.taskParameters.sourceBranch || this.branch;
                        let versionToUse = this.taskParameters.sourceVersion || this.commitId;
                        // Add version information for matching GitHub artifact
                        let artifactMetadata = {
                            alias: gitHubArtifact.alias,
                            instanceReference: {
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
            let releaseStartMetadata = {
                definitionId: releaseDefinition.id,
                reason: ReleaseInterfaces.ReleaseReason.ContinuousIntegration,
                artifacts: artifacts,
                variables: variables
            };
            logger_1.Logger.LogPipelineTriggerInput(releaseStartMetadata);
            // Get release API
            let releaseApi = yield webApi.getReleaseApi();
            // Create release
            let release = yield releaseApi.createRelease(releaseStartMetadata, projectName);
            if (release != null) {
                logger_1.Logger.LogPipelineTriggered(displayName, projectName);
                logger_1.Logger.LogPipelineTriggerOutput(release);
                if (release != null && release._links != null) {
                    logger_1.Logger.LogOutputUrl(release._links.web.href);
                }
            }
        });
    }
}
exports.PipelineRunner = PipelineRunner;
// TODO template parameters for designer pipelines ? is this a thing
//      seems like it is not supported in the API
// support source branch and source version
// support pipeline id
// write tests for all the above
// add better IT for designer pipelines
