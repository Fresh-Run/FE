/**
 * Crash recovery for an unsaved run (owner requirement, 러닝 저장 item).
 * Mounted once on the home screen: at cold start, if AsyncStorage holds a
 * pending run from a killed session, offer resume-compose or discard —
 * never silent loss. (Alert UI — no design exists for this; flagged.)
 */
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { t, tf } from '@/lib/i18n';
import { fmtDist } from '@/lib/run-format';
import { adoptRecovered, clearPendingRun, loadPendingFromDisk } from '@/store/pending-run';
import { useSettings } from '@/store/use-settings';

export function PendingRunRecovery() {
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    (async () => {
      const recovered = await loadPendingFromDisk(); // null when memory has a run
      if (!recovered) return;
      const units = useSettings.getState().settings.units;
      const dist = fmtDist(recovered.run.distanceKm, units, 2);
      Alert.alert(
        t('rec2.title'),
        // eslint-disable-next-line no-restricted-syntax -- imperative fire-time read (Alert/share/handler), not render-path
        tf('rec2.body', { d: `${dist}${units}` }),
        [
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => clearPendingRun(),
          },
          {
            text: t('rec2.resume'),
            onPress: () => {
              adoptRecovered(recovered.run, recovered.draft);
              router.push('/(course)/run-save' as any);
            },
          },
        ],
      );
    })();
  }, []);

  return null;
}
