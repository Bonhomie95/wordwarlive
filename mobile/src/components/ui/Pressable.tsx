// react-native's Pressable plus the app's tap feedback: a soft click and a
// light vibration, each following its Settings toggle. Screens import this
// instead of the stock one; MotionPressable and the game keyboard have
// their own feedback.

import { forwardRef } from 'react';
import { Pressable as RNPressable, type PressableProps, type View } from 'react-native';
import { selection } from '../../lib/haptics';
import { playSound } from '../../lib/sound';

export function tapFeedback(): void {
    selection();
    playSound('tap');
}

export const Pressable = forwardRef<View, PressableProps>(function Pressable({ onPress, ...props }, ref) {
    return (
        <RNPressable
            ref={ref}
            {...props}
            onPress={
                onPress
                    ? (e) => {
                          tapFeedback();
                          onPress(e);
                      }
                    : undefined
            }
        />
    );
});
