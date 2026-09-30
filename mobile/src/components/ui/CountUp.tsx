// Number that counts from `from` to `to` (ease-out) when it mounts or when
// `to` changes. Static when the OS asks for reduced motion.
import React, { useEffect, useState } from 'react';
import { Text, type TextProps } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface Props extends TextProps {
    to: number;
    from?: number;
    durationMs?: number;
    delayMs?: number;
    prefix?: string;
    suffix?: string;
    /** Show an explicit "+" for positive values. */
    signed?: boolean;
}

export const CountUp: React.FC<Props> = ({
    to,
    from = 0,
    durationMs = 800,
    delayMs = 0,
    prefix = '',
    suffix = '',
    signed = false,
    ...textProps
}) => {
    const reduced = useReducedMotion();
    const [animated, setValue] = useState(from);
    const value = reduced ? to : animated;

    useEffect(() => {
        if (reduced) return;
        let frame = 0;
        let start = 0;
        const timer = setTimeout(() => {
            const tick = (now: number) => {
                if (!start) start = now;
                const t = Math.min(1, (now - start) / durationMs);
                const eased = 1 - Math.pow(1 - t, 3);
                setValue(Math.round(from + (to - from) * eased));
                if (t < 1) frame = requestAnimationFrame(tick);
            };
            frame = requestAnimationFrame(tick);
        }, delayMs);
        return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
    }, [to, from, durationMs, delayMs, reduced]);

    const sign = signed && value > 0 ? '+' : '';
    return (
        <Text {...textProps} allowFontScaling={false}>
            {prefix}{sign}{value.toLocaleString()}{suffix}
        </Text>
    );
};
