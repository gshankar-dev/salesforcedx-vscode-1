/*
 * Copyright (c) 2024, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as os from 'os';
import { INTERNAL_FILTER } from '../../constants';

export const isInternalUser = (): boolean => {
  const osHostName = os.hostname();
  console.log(osHostName);
  return osHostName.endsWith(INTERNAL_FILTER) ? true : false;
};
