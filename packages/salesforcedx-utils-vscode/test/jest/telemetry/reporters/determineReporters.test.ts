/*
 * Copyright (c) 2024, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { AppInsights, TelemetryService } from '../../../../src';
import * as Settings from '../../../../src/settings';
import { determineReporters, getTelemetryReporterName } from '../../../../src/telemetry/reporters/determineReporters';
import { LogStream } from '../../../../src/telemetry/reporters/logStream';
import { LogStreamConfig } from '../../../../src/telemetry/reporters/logStreamConfig';
import { TelemetryFile } from '../../../../src/telemetry/reporters/telemetryFile';

const extName = 'salesforcedx-vscode';
const version = '1.0.0';
const aiKey = '1234567890';

describe('determineReporters', () => {

  beforeEach(() => {
    // local logging
    Settings.SettingsService.isAdvancedSettingEnabledFor = jest.fn().mockReturnValue(false);
    LogStreamConfig.isEnabledFor = jest.fn().mockReturnValue(false);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should return an array', () => {
    const reporters = determineReporters(false, extName, version, aiKey);
    expect(reporters).toBeInstanceOf(Array);
  });

  describe('in dev mode', () => {
    it('should return AppInsights reporter when local logging is disabled and log stream is disabled', () => {
      const reporters = determineReporters(true, extName, version, aiKey);
      expect(reporters).toHaveLength(1);
      expect(reporters[0]).toBeInstanceOf(AppInsights);
    });

    it('should return TelemetryFile reporter when local logging is enabled, and log stream is disabled', () => {
      Settings.SettingsService.isAdvancedSettingEnabledFor = jest.fn().mockReturnValue(true);
      const reporters = determineReporters(true, extName, version, aiKey);
      expect(reporters).toHaveLength(1);
      expect(reporters[0]).toBeInstanceOf(TelemetryFile);
    });

    it('should return AppInsights and LogStream reporters when log stream is enabled', () => {
      LogStreamConfig.isEnabledFor = jest.fn().mockReturnValue(true);
      const reporters = determineReporters(true, extName, version, aiKey);
      expect(reporters).toHaveLength(2);
      expect(reporters[0]).toBeInstanceOf(AppInsights);
      expect(reporters[1]).toBeInstanceOf(LogStream);
    });
  });

  describe('not in dev mode', () => {
    it('should return AppInsights reporter when log stream is disabled', () => {
      const reporters = determineReporters(false, extName, version, aiKey);
      expect(reporters).toHaveLength(1);
      expect(reporters[0]).toBeInstanceOf(AppInsights);
    });

    it('should return AppInsights and LogStream reporters when not in dev mode and log stream is enabled', () => {
      LogStreamConfig.isEnabledFor = jest.fn().mockReturnValue(true);
      const reporters = determineReporters(false, extName, version, aiKey);
      expect(reporters).toHaveLength(2);
      expect(reporters[0]).toBeInstanceOf(AppInsights);
      expect(reporters[1]).toBeInstanceOf(LogStream);
    });
  });

});

describe('getTelemetryReporterName', () => {
  let telemetryService: TelemetryService;
  beforeEach(() => {
    telemetryService = new TelemetryService();
  });

  it('should return "salesforcedx-vscode" when extensionName starts with "salesforcedx-vscode"', () => {
    telemetryService.extensionName = 'salesforcedx-vscode-core';
    const result = getTelemetryReporterName(telemetryService.extensionName);
    expect(result).toBe('salesforcedx-vscode');
  });

  it('should return the actual extensionName when it does not start with "salesforcedx-vscode"', () => {
    telemetryService.extensionName = 'salesforcedx-einstein-gpt';
    const result = getTelemetryReporterName(telemetryService.extensionName);
    expect(result).toBe(telemetryService.extensionName);
  });
});
