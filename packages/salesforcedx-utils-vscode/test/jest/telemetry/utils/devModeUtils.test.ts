/*
 * Copyright (c) 2024, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as Settings from '../../../../src/settings';
import { checkDevLocalLogging } from '../../../../src/telemetry/utils/devModeUtils';

describe('checkDevLocalLogging', () => {
  let spySettingsService: jest.SpyInstance;

  beforeEach(() => {
    spySettingsService = jest
      .spyOn(Settings.SettingsService, 'isAdvancedSettingEnabledFor')
      .mockReturnValue(false);
  });

  afterEach(() => {
    spySettingsService.mockRestore();
  });

  it('returns true when local logging is enabled', () => {
    spySettingsService.mockReturnValue(true);
    expect(checkDevLocalLogging('extName')).toBe(true);
  });

  it('returns false when local logging is disabled', () => {
    expect(checkDevLocalLogging('extName')).toBe(false);
  });
});
