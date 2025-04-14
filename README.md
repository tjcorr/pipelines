# GitHub Action to trigger a run in Azure pipelines

GitHub Actions makes it easy to build, test, and deploy your code right from GitHub. 

However, if you would like to use your GH Action workflows just for CI and for CD, continue to use your favorite [Azure Pipelines](https://azure.microsoft.com/en-in/services/devops/pipelines/) with all the best-in-class features needed to enable compliant, safe deployments to their prod Environments, it is quite possible with this azure/pipelines action.

With this action, you could trigger an Azure pipeline run right from inside an Action workflow.

The definition of this Github Action is in [action.yml](https://github.com/Azure/pipelines/blob/master/action.yml).

## Sample workflow 

Use this action to trigger a specific pipeline (YAML or Classic Release Pipeline) in an Azure DevOps organization.
Action takes Project URL, pipeline name and a [Personal Access Token (PAT)](https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops) for your DevOps account.

```yaml
- uses: Azure/pipelines@v1
  with:
    azure-devops-project-url: 'https://dev.azure.com/organization/project-name'
    azure-pipeline-name: 'pipeline-name' # name of the Azure pipeline to be triggered
    azure-devops-token: '${{ secrets.AZURE_DEVOPS_TOKEN }}'
    azure-pipeline-variables:  '{"variable1": "value1", "variable2": "value2"}' # optional stringified json
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `azure-devops-project-url` | Yes | Fully qualified URL to the Azure DevOps organization along with project name (e.g., https://dev.azure.com/organization/project-name) |
| `azure-pipeline-name` | No* | Name of the Azure Pipeline to be triggered |
| `azure-pipeline-id` | No* | The build definition ID of the Azure Pipeline to be triggered |
| `azure-pipeline-variables` | No | Set/Overwrite pipeline variables as a stringified JSON |
| `azure-template-parameters` | No | Set/Overwrite template parameters |
| `source-branch` | No | Specify to override the default ref ($GITHUB_REF) |
| `source-version` | No | Specify to override the default sha ($GITHUB_SHA) |
| `azure-devops-token` | Yes | Personal access token of the user with access to the pipeline |

\* Either `azure-pipeline-name` or `azure-pipeline-id` must be provided.

## Advanced Examples

### Triggering a pipeline by ID instead of name

```yaml
- uses: Azure/pipelines@v1
  with:
    azure-devops-project-url: 'https://dev.azure.com/organization/project-name'
    azure-pipeline-id: '123' # ID of the Azure pipeline to be triggered
    azure-devops-token: '${{ secrets.AZURE_DEVOPS_TOKEN }}'
```

### Using template parameters and specifying source branch/version

```yaml
- uses: Azure/pipelines@v1
  with:
    azure-devops-project-url: 'https://dev.azure.com/organization/project-name'
    azure-pipeline-name: 'pipeline-name'
    azure-devops-token: '${{ secrets.AZURE_DEVOPS_TOKEN }}'
    azure-pipeline-variables: '{"environment": "production"}'
    azure-template-parameters: '{"param1": "value1", "param2": "value2"}'
    source-branch: 'refs/heads/feature/my-branch'
    source-version: '${{ github.sha }}'
```

# Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
