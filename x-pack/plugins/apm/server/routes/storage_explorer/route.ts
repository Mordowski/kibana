/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import { ProcessorEvent } from '@kbn/observability-plugin/common';
import { createApmServerRoute } from '../apm_routes/create_apm_server_route';
import { getSearchAggregatedTransactions } from '../../lib/helpers/transactions';
import { setupRequest } from '../../lib/helpers/setup_request';
import { indexLifecyclePhaseRt } from '../../../common/storage_explorer_types';
import { getServiceStatistics } from './get_service_statistics';
import {
  probabilityRt,
  environmentRt,
  kueryRt,
  rangeRt,
} from '../default_api_types';
import { AgentName } from '../../../typings/es_schemas/ui/fields/agent';
import { getStorageDetailsPerProcessorEvent } from './get_storage_details_per_processor_event';
import { getRandomSampler } from '../../lib/helpers/get_random_sampler';
import { getSizeTimeseries } from './get_size_timeseries';

const storageExplorerRoute = createApmServerRoute({
  endpoint: 'GET /internal/apm/storage_explorer',
  options: { tags: ['access:apm'] },
  params: t.type({
    query: t.intersection([
      indexLifecyclePhaseRt,
      probabilityRt,
      environmentRt,
      kueryRt,
      rangeRt,
    ]),
  }),
  handler: async (
    resources
  ): Promise<{
    serviceStatistics: Array<{
      serviceName: string;
      environments: string[];
      size?: number;
      agentName: AgentName;
      sampling: number;
    }>;
  }> => {
    const {
      params,
      context,
      request,
      plugins: { security },
    } = resources;

    const {
      query: {
        indexLifecyclePhase,
        probability,
        environment,
        kuery,
        start,
        end,
      },
    } = params;

    const [setup, randomSampler] = await Promise.all([
      setupRequest(resources),
      getRandomSampler({ security, request, probability }),
    ]);

    const searchAggregatedTransactions = await getSearchAggregatedTransactions({
      apmEventClient: setup.apmEventClient,
      config: setup.config,
      kuery,
    });

    const serviceStatistics = await getServiceStatistics({
      setup,
      context,
      indexLifecyclePhase,
      randomSampler,
      environment,
      kuery,
      start,
      end,
      searchAggregatedTransactions,
    });

    return {
      serviceStatistics,
    };
  },
});

const storageExplorerServiceDetailsRoute = createApmServerRoute({
  endpoint: 'GET /internal/apm/services/{serviceName}/storage_details',
  options: { tags: ['access:apm'] },
  params: t.type({
    path: t.type({
      serviceName: t.string,
    }),
    query: t.intersection([
      indexLifecyclePhaseRt,
      probabilityRt,
      environmentRt,
      kueryRt,
      rangeRt,
    ]),
  }),
  handler: async (
    resources
  ): Promise<{
    processorEventStats: Array<{
      processorEvent:
        | ProcessorEvent.transaction
        | ProcessorEvent.error
        | ProcessorEvent.metric
        | ProcessorEvent.span;
      docs: number;
      size: number;
    }>;
  }> => {
    const {
      params,
      context,
      request,
      plugins: { security },
    } = resources;

    const {
      path: { serviceName },
      query: {
        indexLifecyclePhase,
        probability,
        environment,
        kuery,
        start,
        end,
      },
    } = params;

    const [setup, randomSampler] = await Promise.all([
      setupRequest(resources),
      getRandomSampler({ security, request, probability }),
    ]);

    const processorEventStats = await getStorageDetailsPerProcessorEvent({
      setup,
      context,
      indexLifecyclePhase,
      randomSampler,
      environment,
      kuery,
      start,
      end,
      serviceName,
    });

    return { processorEventStats };
  },
});

const storageChartRoute = createApmServerRoute({
  endpoint: 'GET /internal/apm/storage_chart',
  options: { tags: ['access:apm'] },
  params: t.type({
    query: t.intersection([
      indexLifecyclePhaseRt,
      probabilityRt,
      environmentRt,
      kueryRt,
      rangeRt,
    ]),
  }),
  handler: async (
    resources
  ): Promise<{
    storageTimeSeries: Array<{
      serviceName: string;
      timeseries: Array<{ x: number; y: number }>;
    }>;
  }> => {
    const {
      params,
      context,
      request,
      plugins: { security },
    } = resources;

    const {
      query: {
        indexLifecyclePhase,
        probability,
        environment,
        kuery,
        start,
        end,
      },
    } = params;

    const [setup, randomSampler] = await Promise.all([
      setupRequest(resources),
      getRandomSampler({ security, request, probability }),
    ]);

    const searchAggregatedTransactions = await getSearchAggregatedTransactions({
      apmEventClient: setup.apmEventClient,
      config: setup.config,
      kuery,
    });

    const storageTimeSeries = await getSizeTimeseries({
      searchAggregatedTransactions,
      indexLifecyclePhase,
      randomSampler,
      environment,
      kuery,
      start,
      end,
      setup,
      context,
    });

    return { storageTimeSeries };
  },
});

export const storageExplorerRouteRepository = {
  ...storageExplorerRoute,
  ...storageExplorerServiceDetailsRoute,
  ...storageChartRoute,
};
