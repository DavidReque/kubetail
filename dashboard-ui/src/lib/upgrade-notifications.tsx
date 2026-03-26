// Copyright 2024-2025 The Kubetail Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { useQuery } from '@apollo/client/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import appConfig from '@/app-config';
import { CLUSTER_VERSION_STATUS } from '@/lib/graphql/dashboard/ops';

const STORAGE_PREFIX = 'kubetail:updates:cluster:';

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

interface ClusterUpgradeState {
  currentVersion?: string;
  latestVersion?: string;
  fetchedAt?: number;
  dismissedAt?: number;
  skippedVersions?: string[];
}

function storageKey(kubeContext: string): string {
  return `${STORAGE_PREFIX}${kubeContext}`;
}

function readState(kubeContext: string): ClusterUpgradeState {
  try {
    const raw = localStorage.getItem(storageKey(kubeContext));
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeState(kubeContext: string, state: ClusterUpgradeState) {
  try {
    localStorage.setItem(storageKey(kubeContext), JSON.stringify(state));
  } catch {
    // fail silently
  }
}

function patchState(kubeContext: string, patch: Partial<ClusterUpgradeState>) {
  writeState(kubeContext, { ...readState(kubeContext), ...patch });
}

function isCacheValid(state: ClusterUpgradeState): boolean {
  return !!state.latestVersion && !!state.fetchedAt && Date.now() - state.fetchedAt < CACHE_TTL_MS;
}

export interface ClusterUpgradeNotificationState {
  upgradeAvailable: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  dismiss: () => void;
  dontRemindMe: () => void;
}

export function useClusterUpgradeNotification(kubeContext: string): ClusterUpgradeNotificationState {
  const isDesktop = appConfig.environment === 'desktop';
  const [state, setState] = useState(() => readState(kubeContext));

  const cacheValid = isCacheValid(state);

  const { data } = useQuery(CLUSTER_VERSION_STATUS, {
    skip: !isDesktop || !kubeContext || cacheValid,
    variables: { kubeContext },
    fetchPolicy: 'network-only',
  });

  useEffect(() => {
    const result = data?.clusterVersionStatus;
    if (result) {
      patchState(kubeContext, {
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        fetchedAt: Date.now(),
      });
      setState(readState(kubeContext));
    }
  }, [data, kubeContext]);

  const currentVersion = cacheValid
    ? (state.currentVersion ?? null)
    : (data?.clusterVersionStatus?.currentVersion ?? null);

  const latestVersion = cacheValid
    ? (state.latestVersion ?? null)
    : (data?.clusterVersionStatus?.latestVersion ?? null);

  const queryUpdateAvailable = cacheValid
    ? currentVersion !== null && latestVersion !== null && currentVersion !== latestVersion
    : (data?.clusterVersionStatus?.updateAvailable ?? false);

  const dismissed = state.dismissedAt !== undefined && Date.now() - state.dismissedAt < DISMISS_TTL_MS;
  const skipped = latestVersion !== null && (state.skippedVersions ?? []).includes(latestVersion);
  const upgradeAvailable = queryUpdateAvailable && !dismissed && !skipped;

  const dismiss = useCallback(() => {
    patchState(kubeContext, { dismissedAt: Date.now() });
    setState(readState(kubeContext));
  }, [kubeContext]);

  const dontRemindMe = useCallback(() => {
    const { skippedVersions = [] } = readState(kubeContext);
    if (latestVersion && !skippedVersions.includes(latestVersion)) {
      skippedVersions.push(latestVersion);
    }
    patchState(kubeContext, { skippedVersions, dismissedAt: Date.now() });
    setState(readState(kubeContext));
  }, [kubeContext, latestVersion]);

  return useMemo(
    () => ({ upgradeAvailable, currentVersion, latestVersion, dismiss, dontRemindMe }),
    [upgradeAvailable, currentVersion, latestVersion, dismiss, dontRemindMe],
  );
}
