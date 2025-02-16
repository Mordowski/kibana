/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  rangeQuery,
  kqlQuery,
  termQuery,
} from '@kbn/observability-plugin/server';
import { ProcessorEvent } from '@kbn/observability-plugin/common';
import {
  TIER,
  SERVICE_NAME,
  INDEX,
} from '../../../common/elasticsearch_fieldnames';
import { environmentQuery } from '../../../common/utils/environment_query';
import { Setup } from '../../lib/helpers/setup_request';
import { getBucketSizeForAggregatedTransactions } from '../../lib/helpers/get_bucket_size_for_aggregated_transactions';
import {
  IndexLifecyclePhaseSelectOption,
  indexLifeCyclePhaseToDataTier,
} from '../../../common/storage_explorer_types';
import { ApmPluginRequestHandlerContext } from '../typings';
import { RandomSampler } from '../../lib/helpers/get_random_sampler';
import {
  getTotalIndicesStats,
  getEstimatedSizeForDocumentsInIndex,
} from './indices_stats_helpers';

export async function getSizeTimeseries({
  environment,
  kuery,
  setup,
  searchAggregatedTransactions,
  start,
  end,
  indexLifecyclePhase,
  randomSampler,
  context,
}: {
  environment: string;
  kuery: string;
  setup: Setup;
  searchAggregatedTransactions: boolean;
  start: number;
  end: number;
  indexLifecyclePhase: IndexLifecyclePhaseSelectOption;
  randomSampler: RandomSampler;
  context: ApmPluginRequestHandlerContext;
}) {
  const { apmEventClient } = setup;

  const { intervalString } = getBucketSizeForAggregatedTransactions({
    start,
    end,
    searchAggregatedTransactions,
  });

  const [allIndicesStats, res] = await Promise.all([
    getTotalIndicesStats({ setup, context }),
    apmEventClient.search('get_storage_timeseries', {
      apm: {
        events: [
          ProcessorEvent.span,
          ProcessorEvent.transaction,
          ProcessorEvent.error,
          ProcessorEvent.metric,
        ],
      },
      body: {
        size: 0,
        query: {
          bool: {
            filter: [
              ...environmentQuery(environment),
              ...kqlQuery(kuery),
              ...rangeQuery(start, end),
              ...(indexLifecyclePhase !== IndexLifecyclePhaseSelectOption.All
                ? termQuery(
                    TIER,
                    indexLifeCyclePhaseToDataTier[indexLifecyclePhase]
                  )
                : []),
            ],
          },
        },
        aggs: {
          sample: {
            random_sampler: randomSampler,
            aggs: {
              services: {
                terms: {
                  field: SERVICE_NAME,
                  size: 500,
                },
                aggs: {
                  storageTimeSeries: {
                    date_histogram: {
                      field: '@timestamp',
                      fixed_interval: intervalString,
                      min_doc_count: 0,
                      extended_bounds: {
                        min: start,
                        max: end,
                      },
                    },
                    aggs: {
                      indices: {
                        terms: {
                          field: INDEX,
                          size: 500,
                        },
                        aggs: {
                          number_of_metric_docs_for_index: {
                            value_count: {
                              field: INDEX,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  return (
    res.aggregations?.sample.services.buckets.map((serviceBucket) => {
      const timeseries = serviceBucket.storageTimeSeries.buckets.map(
        (dateHistogramBucket) => {
          const estimatedSize = allIndicesStats
            ? dateHistogramBucket.indices.buckets.reduce((prev, curr) => {
                return (
                  prev +
                  getEstimatedSizeForDocumentsInIndex({
                    allIndicesStats,
                    indexName: curr.key as string,
                    numberOfDocs: curr.number_of_metric_docs_for_index.value,
                  })
                );
              }, 0)
            : 0;

          return {
            x: dateHistogramBucket.key,
            y: estimatedSize,
          };
        }
      );

      return {
        serviceName: serviceBucket.key as string,
        timeseries,
      };
    }) ?? []
  );
}
