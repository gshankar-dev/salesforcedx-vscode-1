/*
 * Copyright (c) 2024, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as os from 'os';
import { isInternalUser } from '../../../../src/telemetry/utils/isInternalUser';

describe('Telemetry internal user check', () => {

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return true if internal user', () => {
    const spy = jest.spyOn(os, 'hostname');
    spy.mockReturnValue('test.internal.salesforce.com');
    expect(isInternalUser()).toBe(true);
  });

  it('should return false if not an internal user', () => {
    const spy = jest.spyOn(os, 'hostname');
    spy.mockReturnValue('test.salesforce.com');
    expect(isInternalUser()).toBe(false);
  });

  it('should return false if hostname is undefined', () => {
    const spy = jest.spyOn(os, 'hostname');
    spy.mockReturnValue('undefined');
    expect(isInternalUser()).toBe(false);
  });
});
