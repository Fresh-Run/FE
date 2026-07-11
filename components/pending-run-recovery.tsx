/**
 * Crash recovery for an unsaved run (owner requirement, 러닝 저장 item).
 * Mounted once on the home screen: at cold start, if AsyncStorage holds a
 * pending run from a killed session, offer resume-compose or discard —
 * never silent loss. (Alert UI — no design exists for this; flagged.)
 */
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

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
        '저장하지 않은 러닝이 있어요',
        `지난 세션의 러닝(${dist}${units})이 저장되지 않았어요. 이어서 저장할까요?`,
        [
          {
            text: '삭제',
            style: 'destructive',
            onPress: () => clearPendingRun(),
          },
          {
            text: '이어서 저장',
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
