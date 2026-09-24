// Responsive layout constants. The UI is portrait phone-first; on iPad,
// foldables and other wide screens the content column is capped and centered
// so cards, grids and the keyboard don't stretch edge to edge. Everything else
// is flex/percentage based and re-lays out on dimension changes (fold/unfold,
// rotation on tablets) via useWindowDimensions.

import type { ViewStyle } from 'react-native';

/** Widest the main content column gets (points). */
export const MAX_CONTENT_WIDTH = 600;

/** Apply to a screen's root/content container. */
export const contentColumn: ViewStyle = {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
};
