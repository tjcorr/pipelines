import * as core from '@actions/core';

export class TaskParameters {
    private static taskparams: TaskParameters;
    private _azureDevopsProjectUrl: string;
    private _azurePipelineName: string;
    private _azurePipelineId: string;
    private _azureDevopsToken: string;
    private _azurePipelineVariables: string;
    private _azureTemplateParameters: string;
    private _sourceBranch: string;
    private _sourceVersion: string;

    private constructor() {
        this._azureDevopsProjectUrl = core.getInput('azure-devops-project-url', { required: true });
        this._azurePipelineName = core.getInput('azure-pipeline-name', { required: false });
        this._azurePipelineId = core.getInput('azure-pipeline-id', { required: false });
        this._azureDevopsToken = core.getInput('azure-devops-token', { required: true });
        this._azurePipelineVariables = core.getInput('azure-pipeline-variables', { required: false });
        this._azureTemplateParameters = core.getInput('azure-template-parameters', { required: false });
        this._sourceBranch = core.getInput('source-branch', { required: false });
        this._sourceVersion = core.getInput('source-version', { required: false });
        
        // Ensure either pipeline name or ID is provided
        if (!this._azurePipelineName && !this._azurePipelineId) {
            throw new Error('Either azure-pipeline-name or azure-pipeline-id must be specified');
        }
    }

    public static getTaskParams() {
        if (!this.taskparams) {
            this.taskparams = new TaskParameters();
        }

        return this.taskparams;
    }

    public get azureDevopsProjectUrl() {
        return this._azureDevopsProjectUrl;
    }

    public get azurePipelineName() {
        return this._azurePipelineName;
    }

    public get azurePipelineId() {
        return this._azurePipelineId;
    }

    public get azureDevopsToken() {
        return this._azureDevopsToken;
    }

    public get azurePipelineVariables() {
        return this._azurePipelineVariables;
    }

    public get azureTemplateParameters() {
        return this._azureTemplateParameters ? JSON.parse(this._azureTemplateParameters): undefined;
    }

    public get sourceBranch() {
        return this._sourceBranch;
    }

    public get sourceVersion() {
        return this._sourceVersion;
    }
}