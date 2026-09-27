import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Start conservatively and react to changes while the app is open. */
export function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(true);
    useEffect(() => {
        let active = true;
        const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
        AccessibilityInfo.isReduceMotionEnabled().then((value) => {
            if (active) setReduced(value);
        }).catch(() => {});
        return () => { active = false; sub.remove(); };
    }, []);
    return reduced;
}
