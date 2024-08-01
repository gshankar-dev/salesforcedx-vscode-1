/*
 * Copyright (c) 2024, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { SFDX_EXTENSION_PACK_NAME } from '../../constants';
import { checkDevLocalLogging } from '../../telemetry/utils/devModeUtils';
import { TelemetryReporter } from '../interfaces';
import { AppInsights } from './appInsights';
import { LogStream } from './logStream';
import { LogStreamConfig } from './logStreamConfig';
import { TelemetryFile } from './telemetryFile';

export const determineReporters = (
  isDevMode: boolean,
  extName: string,
  version: string,
  aiKey: string
) => {
  const reporters: TelemetryReporter[] = [];
  const isLogStreamEnabled = LogStreamConfig.isEnabledFor(extName);
  const reporterName = getTelemetryReporterName(extName);


  if(isDevMode && checkDevLocalLogging(extName)) {
    // The new TelemetryFile reporter is run in Dev mode, and only
    // requires the advanced setting to be set re: configuration.
    reporters.push(new TelemetryFile(extName));
  } else {
    console.log('adding AppInsights reporter.');
    reporters.push(
      new AppInsights(
        reporterName,
        version,
        aiKey,
        true
      )
    );
    // Assuming this fs streaming is more efficient than the appendFile technique that
    // the new TelemetryFile reporter uses, I am keeping the logic in place for which
    // reporter is used when.  The original log stream functionality only worked under
    // the same conditions as the AppInsights capabilities, but with additional configuration.
    if (isLogStreamEnabled) {
      reporters.push(
        new LogStream(
          reporterName,
          LogStreamConfig.logFilePath()
        )
      );
    }
  }
  return reporters;
};

/**
 * Helper to get the name for telemetryReporter
 * if the extension from extension pack, use salesforcedx-vscode
 * otherwise use the extension name
 */
export const getTelemetryReporterName = (extName: string): string => {
  return extName.startsWith(SFDX_EXTENSION_PACK_NAME)
    ? SFDX_EXTENSION_PACK_NAME
    : extName;
};
