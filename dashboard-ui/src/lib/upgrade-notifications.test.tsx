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

import type { MockedResponse } from '@apollo/client/testing';
import { act, screen, waitFor } from '@testing-library/react';

import appConfig from '@/app-config';
import { CLUSTER_VERSION_STATUS } from '@/lib/graphql/dashboard/ops';
import { renderElement } from '@/test-utils';

import { useClusterUpgradeNotification } from './upgrade-notifications';

const STORAGE_PREFIX = 'kubetail:updates:cluster:';
const KUBE_CONTEXT = 'test-cluster';

function TestConsumer({ kubeContext = KUBE_CONTEXT }: { kubeContext?: string }) {
  const { upgradeAvailable, currentVersion, latestVersion } = useClusterUpgradeNotification(kubeContext);
  return (
    <div>
      {upgradeAvailable && <span data-testid="cluster-upgrade">{latestVersion}</span>}
      {currentVersion && <span data-testid="current-version">{currentVersion}</span>}
    </div>
  );
}

function renderWithMocks(mocks: MockedResponse[], kubeContext?: string) {
  return renderElement(<TestConsumer kubeContext={kubeContext} />, mocks);
}

const upgradeAvailableMock: MockedResponse = {
  request: { query: CLUSTER_VERSION_STATUS, variables: { kubeContext: KUBE_CONTEXT } },
  result: {
    data: { clusterVersionStatus: { currentVersion: '0.9.0', latestVersion: '1.0.0', updateAvailable: true } },
  },
};

const noUpgradeMock: MockedResponse = {
  request: { query: CLUSTER_VERSION_STATUS, variables: { kubeContext: KUBE_CONTEXT } },
  result: {
    data: { clusterVersionStatus: { currentVersion: '1.0.0', latestVersion: '1.0.0', updateAvailable: false } },
  },
};

const nullResultMock: MockedResponse = {
  request: { query: CLUSTER_VERSION_STATUS, variables: { kubeContext: KUBE_CONTEXT } },
  result: { data: { clusterVersionStatus: null } },
};

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.defineProperty(appConfig, 'environment', { value: 'desktop', writable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useClusterUpgradeNotification', () => {
  it('shows upgrade notification when updateAvailable is true', async () => {
    renderWithMocks([upgradeAvailableMock]);

    await waitFor(() => {
      expect(screen.getByTestId('cluster-upgrade')).toBeInTheDocument();
      expect(screen.getByTestId('cluster-upgrade')).toHaveTextContent('1.0.0');
    });
  });

  it('does not show upgrade notification when updateAvailable is false', async () => {
    renderWithMocks([noUpgradeMock]);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('cluster-upgrade')).not.toBeInTheDocument();
    });
  });

  it('does not show notification when dismissed less than 24h ago', async () => {
    localStorage.setItem(`${STORAGE_PREFIX}${KUBE_CONTEXT}`, JSON.stringify({ dismissedAt: Date.now() }));
    renderWithMocks([upgradeAvailableMock]);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('cluster-upgrade')).not.toBeInTheDocument();
    });
  });

  it('does not show notification when version is in skipped list', async () => {
    localStorage.setItem(`${STORAGE_PREFIX}${KUBE_CONTEXT}`, JSON.stringify({ skippedVersions: ['1.0.0'] }));
    renderWithMocks([upgradeAvailableMock]);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('cluster-upgrade')).not.toBeInTheDocument();
    });
  });

  it('fails silently when query returns null', async () => {
    renderWithMocks([nullResultMock]);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('cluster-upgrade')).not.toBeInTheDocument();
    });
  });

  it('uses cached data when cache is fresh', async () => {
    localStorage.setItem(
      `${STORAGE_PREFIX}${KUBE_CONTEXT}`,
      JSON.stringify({
        currentVersion: '0.9.0',
        latestVersion: '0.9.0',
        fetchedAt: Date.now(),
      }),
    );

    renderWithMocks([]);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('cluster-upgrade')).not.toBeInTheDocument();
    });
  });

  it('skips query when environment is not desktop', async () => {
    Object.defineProperty(appConfig, 'environment', { value: 'cluster', writable: true });
    renderWithMocks([upgradeAvailableMock]);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('cluster-upgrade')).not.toBeInTheDocument();
    });
  });

  it('keys state per kubeContext', async () => {
    const context2 = 'other-cluster';
    const mock2: MockedResponse = {
      request: { query: CLUSTER_VERSION_STATUS, variables: { kubeContext: context2 } },
      result: {
        data: { clusterVersionStatus: { currentVersion: '0.8.0', latestVersion: '1.0.0', updateAvailable: true } },
      },
    };

    // Dismiss for test-cluster
    localStorage.setItem(`${STORAGE_PREFIX}${KUBE_CONTEXT}`, JSON.stringify({ dismissedAt: Date.now() }));

    renderWithMocks([upgradeAvailableMock, mock2], context2);

    await waitFor(() => {
      expect(screen.getByTestId('cluster-upgrade')).toHaveTextContent('1.0.0');
    });
  });
});
