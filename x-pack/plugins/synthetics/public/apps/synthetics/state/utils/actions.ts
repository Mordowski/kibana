/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAction } from '@reduxjs/toolkit';
import type { IHttpFetchError } from '@kbn/core-http-browser';

export function createAsyncAction<Payload, SuccessPayload>(actionStr: string) {
  return {
    get: createAction<Payload>(actionStr),
    success: createAction<SuccessPayload>(`${actionStr}_SUCCESS`),
    fail: createAction<IHttpFetchError>(`${actionStr}_FAIL`),
  };
}

export type Nullable<T> = T | null;
