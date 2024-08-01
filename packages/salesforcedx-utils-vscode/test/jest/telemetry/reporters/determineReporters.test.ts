/*
 * Copyright (c) 2024, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { TelemetryService } from '../../../../src';
import { getTelemetryReporterName } from '../../../../src/telemetry/reporters/determineReporters';

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
