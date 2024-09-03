/*
 * Copyright (c) 2017, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {
  getTestResultsFolder,
  ActivationTracker
} from '@salesforce/salesforcedx-utils-vscode';
import * as path from 'path';
import * as vscode from 'vscode';

console.log('Starting index.ts for Apex Extension');

class Logger {
  private static timestamps: Map<string, number> = new Map();

  static logWithTimestamp(message: string) {
    const now = new Date();
    const timestamp = now.toISOString();
    console.log(`[${timestamp}] ${message}`);
  }

  static startTiming(eventName: string) {
    const now = new Date();
    this.timestamps.set(eventName, now.getTime());
    this.logWithTimestamp(`Started timing event: ${eventName}`);
  }

  static endTiming(eventName: string) {
    const now = new Date();
    const endTime = now.getTime();
    const startTime = this.timestamps.get(eventName);

    if (startTime) {
      const duration = endTime - startTime;
      this.logWithTimestamp(`Event ${eventName} took ${duration} ms`);
      this.timestamps.delete(eventName); // Optionally clear the start time
    } else {
      this.logWithTimestamp(`No start time found for event: ${eventName}`);
    }
  }
}

Logger.startTiming('T00 Import Apex related libraries');
const importStart = process.hrtime();


import { ApexLanguageClient } from './apexLanguageClient';
import ApexLSPStatusBarItem from './apexLspStatusBarItem';
import { CodeCoverage, StatusBarToggle } from './codecoverage';

import {
  anonApexDebug,
  anonApexExecute,
  apexDebugClassRunCodeActionDelegate,
  apexDebugMethodRunCodeActionDelegate,
  apexLogGet,
  apexTestClassRunCodeAction,
  apexTestClassRunCodeActionDelegate,
  apexTestMethodRunCodeAction,
  apexTestMethodRunCodeActionDelegate,
  apexTestRun,
  apexTestSuiteAdd,
  apexTestSuiteCreate,
  apexTestSuiteRun,
  launchApexReplayDebuggerWithCurrentFile
} from './commands';
import { API, SET_JAVA_DOC_LINK } from './constants';
import { workspaceContext } from './context';
import * as languageServer from './languageServer';
import { languageServerOrphanHandler as lsoh } from './languageServerOrphanHandler';
import {
  ClientStatus,
  enableJavaDocSymbols,
  extensionUtils,
  getApexTests,
  getExceptionBreakpointInfo,
  getLineBreakpointInfo,
  languageClientUtils
} from './languageUtils';
import { nls } from './messages';
import { retrieveEnableSyncInitJobs } from './settings';
import { telemetryService } from './telemetry';
import { getTestOutlineProvider } from './views/testOutlineProvider';
import { ApexTestRunner, TestRunType } from './views/testRunner';

const importEnd = telemetryService.getEndHRTime(importStart);
Logger.endTiming('T00 Import Apex related libraries');
telemetryService.sendEventData('importApexRelatedLibraries', undefined, {
  activationTime: importEnd
});

export const activate = async (extensionContext: vscode.ExtensionContext) => {

  Logger.startTiming('T01 Activate Function');
  const activateStart = process.hrtime();
  const activationTracker = new ActivationTracker(
    extensionContext,
    telemetryService
  );

  const languageServerStatusBarItem = new ApexLSPStatusBarItem();
  const testOutlineProvider = getTestOutlineProvider();
  if (vscode.workspace && vscode.workspace.workspaceFolders) {
    const apexDirPath = getTestResultsFolder(
      vscode.workspace.workspaceFolders[0].uri.fsPath,
      'apex'
    );

    const testResultOutput = path.join(apexDirPath, '*.json');
    const testResultFileWatcher =
      vscode.workspace.createFileSystemWatcher(testResultOutput);
    testResultFileWatcher.onDidCreate(uri =>
      testOutlineProvider.onResultFileCreate(apexDirPath, uri.fsPath)
    );
    testResultFileWatcher.onDidChange(uri =>
      testOutlineProvider.onResultFileCreate(apexDirPath, uri.fsPath)
    );

    extensionContext.subscriptions.push(testResultFileWatcher);
  } else {
    throw new Error(nls.localize('cannot_determine_workspace'));
  }

  // Workspace Context
  await workspaceContext.initialize(extensionContext);

  // Telemetry
  await telemetryService.initializeService(extensionContext);

  // start the language server and client
  Logger.startTiming('T01.1 start the language server and client');
  await createLanguageClient(extensionContext, languageServerStatusBarItem);
  Logger.endTiming('T01.1 start the language server and client');

  // Javadoc support
  enableJavaDocSymbols();

  // Commands
  Logger.startTiming('T01.2 Register Commands in the activate function');
  const commands = registerCommands();
  extensionContext.subscriptions.push(commands);
  Logger.endTiming('T01.2 Register Commands in the activate function');
  Logger.startTiming('T01.3 Register Test View in the activate function');
  extensionContext.subscriptions.push(registerTestView());
  Logger.endTiming('T01.3 Register Test View in the activate function');

  const exportedApi = {
    getLineBreakpointInfo,
    getExceptionBreakpointInfo,
    getApexTests,
    languageClientUtils
  };
  void activationTracker.markActivationStop(new Date());
  const activateEnd = telemetryService.getEndHRTime(activateStart);
  Logger.endTiming('T01 Activate Function');
  telemetryService.sendEventData('Activate', undefined, {
    activationTime: activateEnd
  });
  return exportedApi;
};


const registerCommands = (): vscode.Disposable => {
  Logger.startTiming('T01.2 Register Commands');
  const registerCommandsStart = process.hrtime();
  // Colorize code coverage
  const statusBarToggle = new StatusBarToggle();
  const colorizer = new CodeCoverage(statusBarToggle);
  const apexToggleColorizerCmd = vscode.commands.registerCommand(
    'sf.apex.toggle.colorizer',
    () => colorizer.toggleCoverage()
  );

  // Customer-facing commands
  const apexTestClassRunDelegateCmd = vscode.commands.registerCommand(
    'sf.apex.test.class.run.delegate',
    apexTestClassRunCodeActionDelegate
  );
  const apexTestLastClassRunCmd = vscode.commands.registerCommand(
    'sf.apex.test.last.class.run',
    apexTestClassRunCodeAction
  );
  const apexTestClassRunCmd = vscode.commands.registerCommand(
    'sf.apex.test.class.run',
    apexTestClassRunCodeAction
  );
  const apexTestMethodRunDelegateCmd = vscode.commands.registerCommand(
    'sf.apex.test.method.run.delegate',
    apexTestMethodRunCodeActionDelegate
  );
  const apexDebugClassRunDelegateCmd = vscode.commands.registerCommand(
    'sf.apex.debug.class.run.delegate',
    apexDebugClassRunCodeActionDelegate
  );
  const apexDebugMethodRunDelegateCmd = vscode.commands.registerCommand(
    'sf.apex.debug.method.run.delegate',
    apexDebugMethodRunCodeActionDelegate
  );
  const anonApexRunDelegateCmd = vscode.commands.registerCommand(
    'sf.anon.apex.run.delegate',
    anonApexExecute
  );
  const anonApexDebugDelegateCmd = vscode.commands.registerCommand(
    'sf.anon.apex.debug.delegate',
    anonApexDebug
  );
  const apexLogGetCmd = vscode.commands.registerCommand(
    'sf.apex.log.get',
    apexLogGet
  );
  const apexTestLastMethodRunCmd = vscode.commands.registerCommand(
    'sf.apex.test.last.method.run',
    apexTestMethodRunCodeAction
  );
  const apexTestMethodRunCmd = vscode.commands.registerCommand(
    'sf.apex.test.method.run',
    apexTestMethodRunCodeAction
  );
  const apexTestSuiteCreateCmd = vscode.commands.registerCommand(
    'sf.apex.test.suite.create',
    apexTestSuiteCreate
  );
  const apexTestSuiteRunCmd = vscode.commands.registerCommand(
    'sf.apex.test.suite.run',
    apexTestSuiteRun
  );
  const apexTestSuiteAddCmd = vscode.commands.registerCommand(
    'sf.apex.test.suite.add',
    apexTestSuiteAdd
  );
  const apexTestRunCmd = vscode.commands.registerCommand(
    'sf.apex.test.run',
    apexTestRun
  );
  const anonApexExecuteDocumentCmd = vscode.commands.registerCommand(
    'sf.anon.apex.execute.document',
    anonApexExecute
  );
  const anonApexDebugDocumentCmd = vscode.commands.registerCommand(
    'sf.apex.debug.document',
    anonApexDebug
  );
  const anonApexExecuteSelectionCmd = vscode.commands.registerCommand(
    'sf.anon.apex.execute.selection',
    anonApexExecute
  );
  const launchApexReplayDebuggerWithCurrentFileCmd =
    vscode.commands.registerCommand(
      'sf.launch.apex.replay.debugger.with.current.file',
      launchApexReplayDebuggerWithCurrentFile
    );
  const registerCommandsEnd = telemetryService.getEndHRTime(registerCommandsStart);
  Logger.endTiming('T01.2 Register Commands');
  telemetryService.sendEventData('registerCommands', undefined, {
    activationTime: registerCommandsEnd
  });
  return vscode.Disposable.from(
    anonApexDebugDelegateCmd,
    anonApexDebugDocumentCmd,
    anonApexExecuteDocumentCmd,
    anonApexExecuteSelectionCmd,
    anonApexRunDelegateCmd,
    apexDebugClassRunDelegateCmd,
    apexDebugMethodRunDelegateCmd,
    apexLogGetCmd,
    apexTestClassRunCmd,
    apexTestClassRunDelegateCmd,
    apexTestLastClassRunCmd,
    apexTestLastMethodRunCmd,
    apexTestMethodRunCmd,
    apexTestMethodRunDelegateCmd,
    apexTestRunCmd,
    apexToggleColorizerCmd,
    apexTestSuiteCreateCmd,
    apexTestSuiteRunCmd,
    apexTestSuiteAddCmd,
    launchApexReplayDebuggerWithCurrentFileCmd
  );
};

const registerTestView = (): vscode.Disposable => {
  Logger.startTiming('T01.3 Register Test View');
  const registerTestViewStart = process.hrtime();
  const testOutlineProvider = getTestOutlineProvider();
  // Create TestRunner
  const testRunner = new ApexTestRunner(testOutlineProvider);

  // Test View
  const testViewItems = new Array<vscode.Disposable>();

  const testProvider = vscode.window.registerTreeDataProvider(
    'sf.test.view',
    testOutlineProvider
  );
  testViewItems.push(testProvider);

  // Run Test Button on Test View command
  testViewItems.push(
    vscode.commands.registerCommand('sf.test.view.run', () =>
      testRunner.runAllApexTests()
    )
  );
  // Show Error Message command
  testViewItems.push(
    vscode.commands.registerCommand('sf.test.view.showError', test =>
      testRunner.showErrorMessage(test)
    )
  );
  // Show Definition command
  testViewItems.push(
    vscode.commands.registerCommand('sf.test.view.goToDefinition', test =>
      testRunner.showErrorMessage(test)
    )
  );
  // Run Class Tests command
  testViewItems.push(
    vscode.commands.registerCommand('sf.test.view.runClassTests', test =>
      testRunner.runApexTests([test.name], TestRunType.Class)
    )
  );
  // Run Single Test command
  testViewItems.push(
    vscode.commands.registerCommand('sf.test.view.runSingleTest', test =>
      testRunner.runApexTests([test.name], TestRunType.Method)
    )
  );
  // Refresh Test View command
  testViewItems.push(
    vscode.commands.registerCommand('sf.test.view.refresh', () => {
      if (languageClientUtils.getStatus().isReady()) {
        return testOutlineProvider.refresh();
      }
    })
  );
  const registerTestViewEnd = telemetryService.getEndHRTime(registerTestViewStart);
  Logger.endTiming('T01.3 Register Test View');
  telemetryService.sendEventData('registerTestView', undefined, {
    activationTime: registerTestViewEnd
  });

  return vscode.Disposable.from(...testViewItems);
};

export const deactivate = async () => {
  const deactivateStart = process.hrtime();
  Logger.startTiming('Deactivate');
  await languageClientUtils.getClientInstance()?.stop();
  telemetryService.sendExtensionDeactivationEvent();
  const deactivateEnd = telemetryService.getEndHRTime(deactivateStart);
  Logger.endTiming('Deactivate');
  telemetryService.sendEventData('deactivate', undefined, {
    activationTime: deactivateEnd
  });
};

const createLanguageClient = async (
  extensionContext: vscode.ExtensionContext,
  languageServerStatusBarItem: ApexLSPStatusBarItem
): Promise<void> => {
  Logger.startTiming('T01.1 Create Language Client');
  const createLanguageClientStart = process.hrtime();
  // Resolve any found orphan language servers
  void lsoh.resolveAnyFoundOrphanLanguageServers();
  // Initialize Apex language server
  try {
    Logger.startTiming('T01.1.1 ApexLSP Startup');
    const langClientHRStart = process.hrtime();

    Logger.startTiming('T01.1.1.1 Create Language Server');
    const createLangServerStart = process.hrtime();
    languageClientUtils.setClientInstance(
      await languageServer.createLanguageServer(extensionContext)
    );
    const createLangServerEnd = telemetryService.getEndHRTime(createLangServerStart); // Record the end time
    Logger.endTiming('T01.1.1.1 Create Language Server');
    telemetryService.sendEventData('CreateLanguageServer', undefined, {
      activationTime: createLangServerEnd
    });

    const languageClient = languageClientUtils.getClientInstance();

    if (languageClient) {
      languageClient.errorHandler?.addListener('error', message => {
        languageServerStatusBarItem.error(message);
      });
      languageClient.errorHandler?.addListener('restarting', count => {
        languageServerStatusBarItem.error(
          nls
            .localize('apex_language_server_quit_and_restarting')
            .replace('$N', count)
        );
      });
      languageClient.errorHandler?.addListener('startFailed', () => {
        languageServerStatusBarItem.error(
          nls.localize('apex_language_server_failed_activate')
        );
      });


      // TODO: the client should not be undefined. We should refactor the code to
      // so there is no question as to whether the client is defined or not.
      Logger.startTiming('T01.1.1.2 Start Language Client');
      const startLangServerStart = process.hrtime();
      await languageClient.start();
      const startLangServerEnd = telemetryService.getEndHRTime(startLangServerStart); // Record the end time
      Logger.endTiming('T01.1.1.2 Start Language Client');
      telemetryService.sendEventData('StartLanguageClient', undefined, {
        activationTime: startLangServerEnd
      });

      // Client is running
      const startTime = telemetryService.getEndHRTime(langClientHRStart); // Record the end time
      Logger.endTiming('T01.1.1 ApexLSP Startup');
      telemetryService.sendEventData('apexLSPStartup', undefined, {
        activationTime: startTime
      });
      Logger.startTiming('T01.1.2 First Index Done Handler');
      const IndexDoneHandlerStart = process.hrtime();
      await indexerDoneHandler(
        retrieveEnableSyncInitJobs(),
        languageClient,
        languageServerStatusBarItem
      );
      const IndexDoneHandlerEnd = telemetryService.getEndHRTime(IndexDoneHandlerStart); // Record the end time
      telemetryService.sendEventData('firstIndexDoneHandler', undefined, {
        activationTime: IndexDoneHandlerEnd
      });
      Logger.endTiming('T01.1.2 First Index Done Handler');
      extensionContext.subscriptions.push(
        languageClientUtils.getClientInstance()!
      );
    } else {
      languageClientUtils.setStatus(
        ClientStatus.Error,
        `${nls.localize(
          'apex_language_server_failed_activate'
        )} - ${nls.localize('unknown')}`
      );
      languageServerStatusBarItem.error(
        `${nls.localize(
          'apex_language_server_failed_activate'
        )} - ${nls.localize('unknown')}`
      );
    }
  } catch (e) {
    languageClientUtils.setStatus(ClientStatus.Error, e);
    let eMsg =
      typeof e === 'string' ? e : e.message ?? nls.localize('unknown_error');
    if (
      eMsg.includes(nls.localize('wrong_java_version_text', SET_JAVA_DOC_LINK))
    ) {
      eMsg = nls.localize('wrong_java_version_short');
    }
    languageServerStatusBarItem.error(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${nls.localize('apex_language_server_failed_activate')} - ${eMsg}`
    );
  }
  const createLanguageClientEnd = telemetryService.getEndHRTime(createLanguageClientStart);
  Logger.endTiming('T01.1 Create Language Client');
  telemetryService.sendEventData('createLanguageClient', undefined, {
    activationTime: createLanguageClientEnd
  });
};


// exported only for test
export const indexerDoneHandler = async (
  enableSyncInitJobs: boolean,
  languageClient: ApexLanguageClient,
  languageServerStatusBarItem: ApexLSPStatusBarItem
) => {
  const indexerDoneHandlerStart = process.hrtime();
  Logger.startTiming('T02 Second Index Done Handler');
  // Listener is useful only in async mode
  if (!enableSyncInitJobs) {
    // The listener should be set after languageClient is ready
    // Language client will get notified once async init jobs are done
    languageClientUtils.setStatus(ClientStatus.Indexing, '');
    languageClient.onNotification(API.doneIndexing, () => {
      void extensionUtils.setClientReady(
        languageClient,
        languageServerStatusBarItem
      );
    });
  } else {
    // indexer must be running at the point
    await extensionUtils.setClientReady(
      languageClient,
      languageServerStatusBarItem
    );
  }
  Logger.endTiming('T02 Second Index Done Handler');
  const indexerDoneHandlerEnd = telemetryService.getEndHRTime(indexerDoneHandlerStart); // Record the end time
  telemetryService.sendEventData('secondIndexerDoneHandler', undefined, {
    activationTime: indexerDoneHandlerEnd
  });
};

