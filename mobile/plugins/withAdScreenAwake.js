// Config plugin (Android): keep the screen on while an AdMob ad is showing.
// Ads open in Google's own AdActivity, a separate window that the app's
// keep-awake flag doesn't reach, so rewarded ads could dim the screen before
// their close button appeared. This flags that activity when it is created.
// (iOS needs nothing: the app-wide idle timer covers in-app ad screens.)
const { withMainApplication } = require('expo/config-plugins');

const MARKER = '// [withAdScreenAwake]';
const HOOK = `
    ${MARKER} keep AdMob's ad screen on while it is showing
    registerActivityLifecycleCallbacks(object : android.app.Application.ActivityLifecycleCallbacks {
      override fun onActivityCreated(activity: android.app.Activity, savedInstanceState: android.os.Bundle?) {
        if (activity.javaClass.name == "com.google.android.gms.ads.AdActivity") {
          activity.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
      }
      override fun onActivityStarted(activity: android.app.Activity) {}
      override fun onActivityResumed(activity: android.app.Activity) {}
      override fun onActivityPaused(activity: android.app.Activity) {}
      override fun onActivityStopped(activity: android.app.Activity) {}
      override fun onActivitySaveInstanceState(activity: android.app.Activity, outState: android.os.Bundle) {}
      override fun onActivityDestroyed(activity: android.app.Activity) {}
    })`;

module.exports = function withAdScreenAwake(config) {
    return withMainApplication(config, (cfg) => {
        const src = cfg.modResults.contents;
        if (src.includes(MARKER)) return cfg;
        const anchor = 'super.onCreate()';
        if (!src.includes(anchor) || cfg.modResults.language !== 'kt') {
            throw new Error('withAdScreenAwake: MainApplication.kt onCreate() not found');
        }
        cfg.modResults.contents = src.replace(anchor, anchor + HOOK);
        return cfg;
    });
};
