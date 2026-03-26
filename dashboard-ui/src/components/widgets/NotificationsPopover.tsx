// Copyright 2024-2025 Andres Morey
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

import { useSubscription } from '@apollo/client/react';
import { ArrowUpCircle } from 'lucide-react';
import { useState } from 'react';

import { Popover, PopoverTrigger, PopoverContent } from '@kubetail/ui/elements/popover';

import appConfig from '@/app-config';
import * as dashboardOps from '@/lib/graphql/dashboard/ops';
import { useUpdateNotification } from '@/lib/update-notifications';
import { useClusterUpgradeNotification } from '@/lib/upgrade-notifications';

const ClusterUpgradeEntry = ({ kubeContext }: { kubeContext: string }) => {
  const { upgradeAvailable, currentVersion, latestVersion } = useClusterUpgradeNotification(kubeContext);

  if (!upgradeAvailable || !latestVersion) return null;

  return (
    <div className="flex items-start gap-2 rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
      <ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        Cluster upgrade: {currentVersion} → {latestVersion}
      </p>
    </div>
  );
};

const useActiveKubeContext = (): string | null => {
  const { data } = useSubscription(dashboardOps.KUBE_CONFIG_WATCH, {
    skip: appConfig.environment !== 'desktop',
  });
  return data?.kubeConfigWatch?.object?.currentContext ?? null;
};

const ClusterUpgradeBadge = ({ kubeContext, showCliDot }: { kubeContext: string | null; showCliDot: boolean }) => {
  const { upgradeAvailable } = useClusterUpgradeNotification(kubeContext ?? '');
  const showDot = showCliDot || upgradeAvailable;

  if (!showDot) return null;
  return <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-blue-500" />;
};

export const NotificationsPopover = ({ children }: React.PropsWithChildren) => {
  const [isOpen, setIsOpen] = useState(false);
  const { updateAvailable, currentVersion, latestVersion } = useUpdateNotification();
  const activeKubeContext = useActiveKubeContext();

  const hasCliUpdate = updateAvailable && !!latestVersion;
  const hasNotifications = hasCliUpdate || (appConfig.environment === 'desktop' && !!activeKubeContext);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="relative h-full">
          {children}
          {(updateAvailable || (appConfig.environment === 'desktop' && activeKubeContext)) && (
            <ClusterUpgradeBadge kubeContext={activeKubeContext} showCliDot={updateAvailable} />
          )}
        </div>
      </PopoverTrigger>
      {isOpen && (
        <PopoverContent side="top" className="w-80 mr-1">
          <div className="space-y-2">
            <p className="text-sm font-medium">Notifications</p>
            {hasCliUpdate && (
              <div className="flex items-start gap-2 rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
                <ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  CLI update: {currentVersion} → {latestVersion}
                </p>
              </div>
            )}
            {appConfig.environment === 'desktop' && activeKubeContext && (
              <ClusterUpgradeEntry kubeContext={activeKubeContext} />
            )}
            {!hasNotifications && <p className="text-sm text-muted-foreground">No new notifications</p>}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
};
