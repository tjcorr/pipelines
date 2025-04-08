import { main } from '../src/main'
import { PipelineRunner } from '../src/pipeline.runner';
import { TaskParameters } from '../src/task.parameters';
import { PipelineHelper } from '../src/util/pipeline.helper';
import { UrlParser } from '../src/util/url.parser'
import * as core from '@actions/core';
import { PipelineNotFoundError } from '../src/pipeline.error';

// Mock fetch without using variables that would be hoisted
jest.mock('node-fetch', () => {
    return jest.fn();
});

// Get a reference to the mocked fetch function
import fetch from 'node-fetch';
import { log } from 'console';
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

// Configure the mock fetch response
const mockFetchResponse = {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: jest.fn(),
    text: jest.fn()
};

var mockQueueBuildResult;
const mockQueueBuild = jest.fn().mockImplementation(() => {
    return mockQueueBuildResult;
});

var mockBuildDefinition;
const mockGetDefinition = jest.fn().mockImplementation(() => {
    return mockBuildDefinition;
});

var mockBuildDefinitions;
const mockGetDefinitions = jest.fn().mockImplementation(() => {
    return mockBuildDefinitions;
});

const mockGetBuildApi = jest.fn().mockImplementation(() => {
    return {
        getDefinitions: (projectName, pipelineName) => mockGetDefinitions(projectName, pipelineName),
        getDefinition: (projectId, buildId) => mockGetDefinition(projectId, buildId),
        queueBuild: (build, projectId, ignoreWarnings) => mockQueueBuild(build, projectId, ignoreWarnings)
    }
});

const mockGetPersonalAccessTokenHandler = jest.fn().mockImplementation();

var mockReleaseDefinitions;
const mockGetReleaseDefinitions = jest.fn().mockImplementation(() => {
    return mockReleaseDefinitions;
});

var mockReleaseResponse;
const mockCreateRelease = jest.fn().mockImplementation(() => {
    return mockReleaseResponse;
});

const mockGetReleaseApi = jest.fn().mockImplementation(() => {
    return {
        getReleaseDefinitions: (project, searchText, artifactType) => mockGetReleaseDefinitions(project, searchText, artifactType),
        createRelease: (releaseStartMetadata, project) => mockCreateRelease(releaseStartMetadata, project)
    }
});

jest.mock('azure-devops-node-api', () => {
    return {
        getPersonalAccessTokenHandler: (token) => mockGetPersonalAccessTokenHandler(token),
        WebApi: jest.fn().mockImplementation(() => {
            return {
                getBuildApi: async (url, handler) => await mockGetBuildApi(url, handler),
                getReleaseApi: async () => await mockGetReleaseApi(),
            }
        }) 
    }
});

describe('Testing all functions of class PipelineHelper', () => {
    test('EnsureValidPipeline() - throw error if definition not found', () => {
        expect(() => PipelineHelper.EnsureValidPipeline('someProject', 'somePipeline', [])).toThrow(new PipelineNotFoundError(`Pipeline named "${'somePipeline'}" not found in project "${'someProject'}"`));
    });

    test('EnsureValidPipeline() - throw error if more than one definition found', () => {
        expect(() => PipelineHelper.EnsureValidPipeline('someProject', 'somePipeline', [{}, {}])).toThrow(`More than 1 Pipeline named "${'somePipeline'}" found in project "${'someProject'}"`);
    });

    test('equals() - return if strings are equal', () => {
        expect(PipelineHelper.equals(null, null)).toBeTruthy();
        expect(PipelineHelper.equals('a', null)).toBeFalsy();
        expect(PipelineHelper.equals(null, 'a')).toBeFalsy();
        expect(PipelineHelper.equals('a', 'a ')).toBeTruthy();
        expect(PipelineHelper.equals('a', 'A')).toBeTruthy();
        expect(PipelineHelper.equals('a', 'b')).toBeFalsy();
    });

    test('processEnv() - return specified env variable', () => {
        process.env['envVar'] = 'value';
        expect(PipelineHelper.processEnv('envVar')).toBe('value');
    });

    test('processEnv() - throw error if specified envVar is not available', () => {
        process.env['envVar'] = '';
        expect(() => PipelineHelper.processEnv('envVar')).toThrow(`env.${'envVar'} is not set`);
    });

    test('isGitHubArtifact() - returns if artifact if of type github', () => {
        expect(PipelineHelper.isGitHubArtifact({})).toBeFalsy();
        expect(PipelineHelper.isGitHubArtifact({ type: 'githuB' })).toBeTruthy();
        expect(PipelineHelper.isGitHubArtifact({ type: null })).toBeFalsy();
    });

    test('getErrorAndWarningMessageFromBuildResult() - concatenate and return errors', () => {
        expect(PipelineHelper.getErrorAndWarningMessageFromBuildResult([
            { message: 'FirstMessage', result: 2},
            { message: 'FirstIgnoredMessage', result: 0},
            { message: 'SecondIgnoredMessage', result: 1},
            { message: 'SecondMessage', result: 2},
        ])).toMatchObject({
            errorMessage: 'FirstMessage,SecondMessage',
            warningMessage: '',
        });
    });

    test('getErrorAndWarningMessageFromBuildResult() - concatenate and return warnings if no errors', () => {
        expect(PipelineHelper.getErrorAndWarningMessageFromBuildResult([
            { message: 'FirstIgnoredMessage', result: 0},
            { message: 'SecondIgnoredMessage', result: 1},
        ])).toMatchObject({
            errorMessage: '',
            warningMessage: 'FirstIgnoredMessage,SecondIgnoredMessage',
        });
    });

    test('getErrorAndWarningMessageFromBuildResult() - message validation error which do not come in form of array', () => {
        expect(PipelineHelper.getErrorAndWarningMessageFromBuildResult(
            { message: 'ErrorMessage' } as any
        )).toMatchObject({
            errorMessage: 'ErrorMessage',
            warningMessage: '',
        });
    });

    test('getErrorAndWarningMessageFromBuildResult() - message from server error which do not come in form of array', () => {
        expect(PipelineHelper.getErrorAndWarningMessageFromBuildResult(
            { serverError: { message: 'ServerErrorMessage'  } } as any
        )).toMatchObject({
            errorMessage: 'ServerErrorMessage',
            warningMessage: '',
        });
    });
});

describe('Testing all functions of class UrlParser', () => {
    test('GetProjectName() - return project name from project URL', () => {
        expect(UrlParser.GetProjectName('https://dev.azure.com/organization/project-name ')).toBe('project-name');
    });

    test('GetProjectName() - throw error if null or empty', () => {
        expect(() => UrlParser.GetProjectName(null)).toThrow('Project url is null or empty. Specify the valid project url and try again');
        expect(() => UrlParser.GetProjectName('')).toThrow('Project url is null or empty. Specify the valid project url and try again');
    });

    test('GetProjectName() - throw error if invalid url', () => {
        expect(() => UrlParser.GetProjectName('https://dev.azure.com/organization/project-name/')).toThrow(`Failed to parse project url: "${'https://dev.azure.com/organization/project-name/'}". Specify the valid project url (eg, https://dev.azure.com/organization/project-name or https://server.example.com:8080/tfs/DefaultCollection/project-name)) and try again.`);
        expect(() => UrlParser.GetProjectName('https://dev.azure.com/organization//')).toThrow(`Failed to parse project url: "${'https://dev.azure.com/organization//'}". Specify the valid project url (eg, https://dev.azure.com/organization/project-name or https://server.example.com:8080/tfs/DefaultCollection/project-name)) and try again.`);
    });

    test('GetCollectionUrlBase() - return collections base URL', () => {
        expect(UrlParser.GetCollectionUrlBase('https://dev.azure.com/organization/project-name ')).toBe('https://dev.azure.com/organization');
    });

    test('GetCollectionUrlBase() - throw error if null or empty', () => {
        expect(() => UrlParser.GetCollectionUrlBase(null)).toThrow('Project url is null or empty. Specify the valid project url and try again');
        expect(() => UrlParser.GetCollectionUrlBase('')).toThrow('Project url is null or empty. Specify the valid project url and try again');
    });

    test('GetCollectionUrlBase() - throw error if invalid url', () => {
        expect(() =>  UrlParser.GetCollectionUrlBase('/')).toThrow(`Failed to parse project url: "${'/'}". Specify the valid project url (eg, https://dev.azure.com/organization/project-name or https://server.example.com:8080/tfs/DefaultCollection/project-name)) and try again.`);
    });
});

describe('Testing all functions of class PipelineRunner', () => {
    beforeEach(() => {
        // Reset mocks before each test
        mockFetch.mockClear();
        mockFetchResponse.json.mockReset();
        mockFetchResponse.text.mockReset();
        mockFetchResponse.ok = true;
        mockFetchResponse.status = 200;
        mockFetchResponse.statusText = 'OK';
        
        // Configure mockFetch to return our mockFetchResponse
        mockFetch.mockResolvedValue(mockFetchResponse);
    });
    
    test('start() - regular run using env variables and inputs to trigger a run', async () => {
        jest.spyOn(core, 'getInput').mockImplementation((input, options) => {
            process.env['GITHUB_REPOSITORY'] = 'repo_name';
            process.env['GITHUB_REF'] = 'releases';
            process.env['GITHUB_SHA'] = 'sampleSha';

            if (input == 'azure-devops-project-url') return 'https://dev.azure.com/organization/my-project';
            if (input == 'azure-pipeline-name') return 'my-pipeline';
            if (input == 'azure-devops-token') return 'my-token';
        });
        jest.spyOn(core, 'debug').mockImplementation();
        jest.spyOn(core, 'info').mockImplementation();
        mockBuildDefinitions = [{
            id: 5
        }];
        mockBuildDefinition = {
            id: 5,
            repository: {
                id: 'repo',
                type: 'Devops'
            },
            project: {
                id: 'my-project'
            },
        }
        
        // Setup fetch response for the pipeline run
        const mockPipelineResult = {
            _links: {
                web: {
                    href: 'linkToRun'
                }
            }
        };
        mockFetchResponse.json.mockResolvedValue(mockPipelineResult);

        expect(await (new PipelineRunner(TaskParameters.getTaskParams())).start()).toBeUndefined();
        expect(mockGetPersonalAccessTokenHandler).toBeCalledWith('my-token');
        expect(mockGetBuildApi).toBeCalled();
        expect(mockGetDefinitions).toBeCalledWith('my-project', 'my-pipeline');
        expect(mockGetDefinition).toBeCalledWith('my-project', 5);
        
        // Verify fetch was called with correct parameters
        expect(mockFetch).toHaveBeenCalled();
        const fetchArgs = mockFetch.mock.calls[0];
        expect(fetchArgs[0]).toContain('my-project/_apis/pipelines/5/runs');
        expect(fetchArgs[1]).toHaveProperty('method', 'POST');
        expect(fetchArgs[1]).toHaveProperty('headers');
        expect(fetchArgs[1].headers).toHaveProperty('Authorization');
        expect(fetchArgs[1].headers).toHaveProperty('Content-Type', 'application/json');
        
        // Verify body was correctly formed
        const requestBody = JSON.parse(fetchArgs[1].body);
        // Empty or minimal body since repository is not linked to same Github repo
        expect(Object.keys(requestBody)).toHaveLength(0);
    });

    test('start() - set core failed in RunYamlPipeline if result has errors', async () => {
        jest.spyOn(core, 'getInput').mockImplementation((input, options) => {
            if (input == 'azure-devops-project-url') return 'https://dev.azure.com/organization/my-project';
            if (input == 'azure-pipeline-name') return 'my-pipeline';
            if (input == 'azure-devops-token') return 'my-token';
        });
        jest.spyOn(core, 'debug').mockImplementation();
        jest.spyOn(core, 'info').mockImplementation();
        jest.spyOn(core, 'setFailed').mockImplementation();
        mockBuildDefinitions = [{
            id: 5
        }];
        mockBuildDefinition = {
            id: 5,
            repository: {
                id: 'repo_name',
                type: 'Github'
            },
            project: {
                id: 'my-project'
            },
        }
        
        // Setup fetch to simulate an error response
        mockFetchResponse.ok = false;
        mockFetchResponse.status = 400;
        mockFetchResponse.statusText = 'Bad Request';
        mockFetchResponse.text.mockResolvedValue('Error validating pipeline run');

        // Set environment variables for the test
        process.env['GITHUB_REPOSITORY'] = 'repo_name';
        process.env['GITHUB_REF'] = 'releases';
        process.env['GITHUB_SHA'] = 'sampleSha';

        await (new PipelineRunner(TaskParameters.getTaskParams())).start();

        expect(mockGetPersonalAccessTokenHandler).toBeCalledWith('my-token');
        expect(mockGetBuildApi).toBeCalled();
        expect(mockGetDefinitions).toBeCalledWith('my-project', 'my-pipeline');
        expect(mockGetDefinition).toBeCalledWith('my-project', 5);
        
        // Verify fetch was called with correct parameters
        expect(mockFetch).toHaveBeenCalled();
        const fetchArgs = mockFetch.mock.calls[0];
        expect(fetchArgs[0]).toContain('my-project/_apis/pipelines/5/runs');
        
        // Verify body includes correct branches and versions since repo is GitHub type
        const requestBody = JSON.parse(fetchArgs[1].body);
        expect(requestBody.resources.repositories.self.refName).toBe('releases');
        expect(requestBody.resources.repositories.self.version).toBe('sampleSha');
        
        // Verify error was reported
        expect(core.setFailed).toBeCalled();
    });

    test('start() - set core failed in case of invalid response', async () => {
        jest.spyOn(core, 'getInput').mockImplementation((input, options) => {
            process.env['GITHUB_REPOSITORY'] = 'repo_name';
            process.env['GITHUB_REF'] = 'releases';
            process.env['GITHUB_SHA'] = 'sampleSha';

            if (input == 'azure-devops-project-url') return 'https://dev.azure.com/organization/my-project';
            if (input == 'azure-pipeline-name') return 'my-pipeline';
            if (input == 'azure-devops-token') return 'my-token';
        });
        jest.spyOn(core, 'debug').mockImplementation();
        jest.spyOn(core, 'info').mockImplementation();
        jest.spyOn(core, 'setFailed').mockImplementation();
        mockBuildDefinitions = [{}, {}];

        expect(await (new PipelineRunner(TaskParameters.getTaskParams())).start()).toBeUndefined();
        expect(mockGetPersonalAccessTokenHandler).toBeCalledWith('my-token');
        expect(mockGetBuildApi).toBeCalled();
        expect(mockGetDefinitions).toBeCalledWith('my-project', 'my-pipeline');
        expect(core.setFailed).toBeCalled();
    });

    test('start() - trigger designer pipeline in case of PipelineNotFoundError', async () => {
        jest.spyOn(core, 'getInput').mockImplementation((input, options) => {
            process.env['GITHUB_REPOSITORY'] = 'repo_name';
            process.env['GITHUB_REF'] = 'releases';
            process.env['GITHUB_SHA'] = 'sampleSha';

            if (input == 'azure-devops-project-url') return 'https://dev.azure.com/organization/my-project';
            if (input == 'azure-pipeline-name') return 'my-pipeline';
            if (input == 'azure-devops-token') return 'my-token';
        });
        jest.spyOn(core, 'debug').mockImplementation();
        jest.spyOn(core, 'info').mockImplementation();
        jest.spyOn(core, 'setFailed').mockImplementation();
        mockBuildDefinitions = null;
        mockReleaseDefinitions = [{
            id: 5,
            artifacts: []
        }];
        mockReleaseResponse = {
            _links: {
                web: {
                    href: 'linkToRun'
                }
            }
        }

        expect(await (new PipelineRunner(TaskParameters.getTaskParams())).start()).toBeUndefined();
        expect(mockGetPersonalAccessTokenHandler).toBeCalledWith('my-token');
        expect(mockGetBuildApi).toBeCalled();
        expect(mockGetDefinitions).toBeCalledWith('my-project', 'my-pipeline');
        expect(mockGetReleaseApi).toBeCalled();
        expect(mockGetReleaseDefinitions).toBeCalledWith('my-project', 'my-pipeline', 4);
        const expectedRelease = {
            artifacts: [], 
            definitionId: 5, 
            reason: 2
        };
        expect(mockCreateRelease).toBeCalledWith(expectedRelease, "my-project");
    });

    test('start() - azure-pipeline-variables passed as JSON for yaml pipeline', async () => {
        // Create a mock TaskParameters object
        const mockTaskParameters = {
            azureDevopsProjectUrl: 'https://dev.azure.com/organization/my-project',
            azurePipelineName: 'my-pipeline',
            azureDevopsToken: 'my-token',
            azurePipelineVariables: '{"var1": "value1", "var2": "value2"}',
            azureTemplateParameters: undefined
        };

        // Mock the TaskParameters.getTaskParams static method
        const originalGetTaskParams = TaskParameters.getTaskParams;
        TaskParameters.getTaskParams = jest.fn().mockReturnValue(mockTaskParameters);

        jest.spyOn(core, 'debug').mockImplementation();
        jest.spyOn(core, 'info').mockImplementation();
        mockBuildDefinitions = [{ id: 5 }];
        mockBuildDefinition = {
            id: 5,
            repository: {
                id: 'repo',
                type: 'Devops'
            },
            project: {
                id: 'my-project'
            },
        };
        
        const mockPipelineResult = {
            _links: {
                web: {
                    href: 'linkToRun'
                }
            }
        };
        mockFetchResponse.json.mockResolvedValue(mockPipelineResult);

        // Set environment variables for the test
        process.env['GITHUB_REPOSITORY'] = 'repo_name';
        process.env['GITHUB_REF'] = 'releases';
        process.env['GITHUB_SHA'] = 'sampleSha';

        await (new PipelineRunner(TaskParameters.getTaskParams())).start();
        
        expect(mockFetch).toHaveBeenCalled();
        const fetchArgs = mockFetch.mock.calls[0];
        console.log('Request body:', fetchArgs[1].body);
        const requestBody = JSON.parse(fetchArgs[1].body);
        
        // Verify variables were parsed correctly
        expect(requestBody.variables).toBeDefined();
        expect(requestBody.variables.var1).toEqual({ value: 'value1' });
        expect(requestBody.variables.var2).toEqual({ value: 'value2' });

        // Clean up mock
        TaskParameters.getTaskParams = originalGetTaskParams;
    });

    test('start() - azure-template-parameters passed as JSON for yaml pipeline', async () => {
        // Create a mock TaskParameters object with template parameters
        const mockTaskParameters = {
            azureDevopsProjectUrl: 'https://dev.azure.com/organization/my-project',
            azurePipelineName: 'my-pipeline',
            azureDevopsToken: 'my-token',
            azurePipelineVariables: undefined,
            // Note: this should be the parsed object, not the string
            azureTemplateParameters: {
                param1: 'value1',
                param2: 42,
                param3: true
            }
        };

        // Mock the TaskParameters.getTaskParams static method
        const originalGetTaskParams = TaskParameters.getTaskParams;
        TaskParameters.getTaskParams = jest.fn().mockReturnValue(mockTaskParameters);

        jest.spyOn(core, 'debug').mockImplementation();
        jest.spyOn(core, 'info').mockImplementation();
        mockBuildDefinitions = [{ id: 5 }];
        mockBuildDefinition = {
            id: 5,
            repository: {
                id: 'repo',
                type: 'Devops'
            },
            project: {
                id: 'my-project'
            },
        };
        
        const mockPipelineResult = {
            _links: {
                web: {
                    href: 'linkToRun'
                }
            }
        };
        mockFetchResponse.json.mockResolvedValue(mockPipelineResult);

        // Set environment variables for the test
        process.env['GITHUB_REPOSITORY'] = 'repo_name';
        process.env['GITHUB_REF'] = 'releases';
        process.env['GITHUB_SHA'] = 'sampleSha';

        await (new PipelineRunner(TaskParameters.getTaskParams())).start();
        
        expect(mockFetch).toHaveBeenCalled();
        const fetchArgs = mockFetch.mock.calls[0];
        console.log('Template parameters test - Request body:', fetchArgs[1].body);
        const requestBody = JSON.parse(fetchArgs[1].body);
        
        // Verify template parameters were parsed correctly
        expect(requestBody.templateParameters).toBeDefined();
        expect(requestBody.templateParameters).toEqual({
            param1: 'value1',
            param2: 42,
            param3: true
        });
        
        // Clean up mock
        TaskParameters.getTaskParams = originalGetTaskParams;
    });

    test('start() - override source branch and source version for yaml pipeline', async () => {
        // Create a mock TaskParameters object with custom source branch and version
        const mockTaskParameters = {
            azureDevopsProjectUrl: 'https://dev.azure.com/organization/my-project',
            azurePipelineName: 'my-pipeline',
            azureDevopsToken: 'my-token',
            azurePipelineVariables: undefined,
            azureTemplateParameters: undefined,
            sourceBranch: 'custom-branch',
            sourceVersion: 'abc123'
        };

        // Mock the TaskParameters.getTaskParams static method
        const originalGetTaskParams = TaskParameters.getTaskParams;
        TaskParameters.getTaskParams = jest.fn().mockReturnValue(mockTaskParameters);

        jest.spyOn(core, 'debug').mockImplementation();
        jest.spyOn(core, 'info').mockImplementation();
        mockBuildDefinitions = [{ id: 5 }];
        mockBuildDefinition = {
            id: 5,
            repository: {
                id: 'repo',
                type: 'Devops'
            },
            project: {
                id: 'my-project'
            },
        };
        
        const mockPipelineResult = {
            _links: {
                web: {
                    href: 'linkToRun'
                }
            }
        };
        mockFetchResponse.json.mockResolvedValue(mockPipelineResult);

        // Set environment variables for the test
        process.env['GITHUB_REPOSITORY'] = 'repo_name';
        process.env['GITHUB_REF'] = 'releases';
        process.env['GITHUB_SHA'] = 'sampleSha';

        await (new PipelineRunner(TaskParameters.getTaskParams())).start();
        
        expect(mockFetch).toHaveBeenCalled();
        const fetchArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(fetchArgs[1].body);
        
        // Verify the custom branch and version were used
        expect(requestBody.resources).toBeDefined();
        expect(requestBody.resources.repositories).toBeDefined();
        expect(requestBody.resources.repositories.self.refName).toBe('custom-branch');
        expect(requestBody.resources.repositories.self.version).toBe('abc123');

        // Clean up mock
        TaskParameters.getTaskParams = originalGetTaskParams;
    });

    test('start() - override source branch and source version for designer pipeline', async () => {
        // Create a mock TaskParameters object with custom source branch and version
        const mockTaskParameters = {
            azureDevopsProjectUrl: 'https://dev.azure.com/organization/my-project',
            azurePipelineName: 'my-pipeline',
            azureDevopsToken: 'my-token',
            azurePipelineVariables: undefined,
            sourceBranch: 'custom-branch',
            sourceVersion: 'abc123'
        };

        // Mock the TaskParameters.getTaskParams static method
        const originalGetTaskParams = TaskParameters.getTaskParams;
        TaskParameters.getTaskParams = jest.fn().mockReturnValue(mockTaskParameters);

        jest.spyOn(core, 'debug').mockImplementation();
        jest.spyOn(core, 'info').mockImplementation();
        mockBuildDefinitions = null;
        mockReleaseDefinitions = [{
            id: 5,
            artifacts: [{
                type: 'GitHub',
                definitionReference: {
                    definition: {
                        name: 'repo_name'
                    }
                },
                alias: 'github_artifact'
            }]
        }];
        mockReleaseResponse = {
            _links: {
                web: {
                    href: 'linkToRun'
                }
            }
        }

        // Set environment variables for the test
        process.env['GITHUB_REPOSITORY'] = 'repo_name';
        process.env['GITHUB_REF'] = 'releases';
        process.env['GITHUB_SHA'] = 'sampleSha';

        await (new PipelineRunner(TaskParameters.getTaskParams())).start();
        
        expect(mockCreateRelease).toHaveBeenCalled();
        const releaseMetadata = mockCreateRelease.mock.calls[0][0];
        
        // Verify the artifact metadata has the custom branch and version
        expect(releaseMetadata.artifacts.length).toBe(1);
        expect(releaseMetadata.artifacts[0].instanceReference.sourceBranch).toBe('custom-branch');
        expect(releaseMetadata.artifacts[0].instanceReference.sourceVersion).toBe('abc123');
        expect(releaseMetadata.artifacts[0].instanceReference.id).toBe('abc123');

        // Clean up mock
        TaskParameters.getTaskParams = originalGetTaskParams;
    });

    test('start() - throw error when neither azure-pipeline-id nor azure-pipeline-name is specified', async () => {
        // We need to mock TaskParameters instead of just core.getInput to ensure the validation throws
        const originalTaskParams = TaskParameters.getTaskParams;
        
        // Create a TaskParameters-like object with the validation we need to test
        const mockTaskParamsClass = {
            getTaskParams: jest.fn().mockImplementation(() => {
                // This simulates the validation in the TaskParameters constructor
                throw new Error('Either azure-pipeline-name or azure-pipeline-id must be specified');
            })
        };
        
        // Replace the TaskParameters class
        TaskParameters.getTaskParams = mockTaskParamsClass.getTaskParams;
        
        jest.spyOn(core, 'setFailed').mockImplementation();

        await (new PipelineRunner(null)).start();
        
        // Verify the error was propagated to core.setFailed
        expect(core.setFailed).toHaveBeenCalledWith(
            expect.stringContaining('Either azure-pipeline-name or azure-pipeline-id must be specified')
        );

        // Clean up mock
        TaskParameters.getTaskParams = originalTaskParams;
    });

    test('start() - use azure-pipeline-id to trigger YAML pipeline', async () => {
        // Reset mocks to ensure clean state
        mockGetDefinition.mockReset();
        mockFetch.mockClear();
        
        // Create mock TaskParameters
        const originalTaskParams = TaskParameters.getTaskParams;
        const mockTaskParamsObj = {
            azureDevopsProjectUrl: 'https://dev.azure.com/organization/my-project',
            azurePipelineName: '',
            azurePipelineId: '42',
            azureDevopsToken: 'my-token',
            sourceBranch: '',
            sourceVersion: '',
            azurePipelineVariables: '',
            azureTemplateParameters: undefined,
        }; 
        
        // Mock the TaskParameters.getTaskParams static method
        TaskParameters.getTaskParams = jest.fn().mockReturnValue(mockTaskParamsObj);
        
        jest.spyOn(core, 'debug').mockImplementation();
        jest.spyOn(core, 'info').mockImplementation();
        
        // Setup expected return values for getDefinition
        mockGetDefinition.mockResolvedValue({
            id: 42,
            repository: {
                id: 'repo',
                type: 'Devops'
            },
            project: {
                id: 'my-project'
            }
        });
        
        const mockPipelineResult = {
            _links: {
                web: {
                    href: 'linkToRun'
                }
            }
        };
        mockFetchResponse.json.mockResolvedValue(mockPipelineResult);

        // Set environment variables for the test
        process.env['GITHUB_REPOSITORY'] = 'repo_name';
        process.env['GITHUB_REF'] = 'releases';
        process.env['GITHUB_SHA'] = 'sampleSha';
        
        // Run the pipeline using TaskParameters.getTaskParams()
        const runner = new PipelineRunner(TaskParameters.getTaskParams());
        await runner.start();

        // Verify that getDefinition was called with the pipeline ID
        expect(mockGetDefinition).toBeCalledWith('my-project', 42);
        
        // Verify fetch was called with correct parameters
        expect(mockFetch).toHaveBeenCalled();
        const fetchArgs = mockFetch.mock.calls[0];
        expect(fetchArgs[0]).toContain('my-project/_apis/pipelines/42/runs');

        // Clean up mock
        TaskParameters.getTaskParams = originalTaskParams;
    });

    test('start() - use azure-pipeline-id to trigger designer pipeline when YAML pipeline not found', async () => {
        // Reset mocks to ensure clean state
        mockGetDefinition.mockReset();
        mockGetReleaseApi.mockReset();
        
        // Create mock TaskParameters
        const originalTaskParams = TaskParameters.getTaskParams;
        const mockTaskParamsObj = {
            azureDevopsProjectUrl: 'https://dev.azure.com/organization/my-project',
            azurePipelineName: '',
            azurePipelineId: '42',
            azureDevopsToken: 'my-token',
            sourceBranch: '',
            sourceVersion: '',
            azurePipelineVariables: '',
            azureTemplateParameters: undefined,
        }; 
        
        // Mock the TaskParameters.getTaskParams static method
        TaskParameters.getTaskParams = jest.fn().mockReturnValue(mockTaskParamsObj);
        
        jest.spyOn(core, 'debug').mockImplementation();
        jest.spyOn(core, 'info').mockImplementation();
        
        // Make the YAML pipeline lookup fail with 404
        mockGetDefinition.mockImplementation(() => {
            // Create custom error object with statusCode property
            const error: any = new Error('Not found');
            error.statusCode = 404;
            throw error;
        });
        
        // Setup the designer pipeline response
        const mockReleaseDefinition = {
            id: 42,
            artifacts: []
        };

        const mockGetReleaseDefinition = jest.fn().mockResolvedValue(mockReleaseDefinition);
        
        // Add getReleaseDefinition to the mock release API
        mockGetReleaseApi.mockImplementation(() => {
            return {
                getReleaseDefinitions: (project, searchText, artifactType) => mockGetReleaseDefinitions(project, searchText, artifactType),
                getReleaseDefinition: (project, definitionId) => mockGetReleaseDefinition(project, definitionId),
                createRelease: (releaseStartMetadata, project) => mockCreateRelease(releaseStartMetadata, project)
            }
        });
        
        mockReleaseResponse = {
            _links: {
                web: {
                    href: 'linkToRun'
                }
            }
        };

        // Set environment variables for the test
        process.env['GITHUB_REPOSITORY'] = 'repo_name';
        process.env['GITHUB_REF'] = 'releases';
        process.env['GITHUB_SHA'] = 'sampleSha';

        // Run the pipeline using TaskParameters.getTaskParams()
        const runner = new PipelineRunner(TaskParameters.getTaskParams());
        await runner.start();

        // Verify that the YAML pipeline was attempted first
        expect(mockGetDefinition).toBeCalledWith('my-project', 42);
        
        // Verify that the designer pipeline was tried next and succeeded
        expect(mockGetReleaseDefinition).toBeCalledWith('my-project', 42);
        expect(mockCreateRelease).toBeCalled();
        
        // Verify correct release definition ID was used
        const releaseMetadata = mockCreateRelease.mock.calls[0][0];
        expect(releaseMetadata.definitionId).toBe(42);

        // Clean up mock
        TaskParameters.getTaskParams = originalTaskParams;
    });
});