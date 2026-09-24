// Config plugin: raise every CocoaPods target's IPHONEOS_DEPLOYMENT_TARGET to
// the app's minimum. Some pods (AdMob/UMP resource bundles, SDWebImage,
// AsyncStorage resources) still declare 9.0–13.4, which Xcode 27 refuses to
// build ("range of supported deployment target versions is 15.0 to 27.x").
// Applied to the generated Podfile's post_install so it survives prebuild.
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MIN_IOS = '15.1';
const MARKER = '# [withPodDeploymentTarget]';

module.exports = function withPodDeploymentTarget(config) {
    return withDangerousMod(config, [
        'ios',
        (cfg) => {
            const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
            let src = fs.readFileSync(podfile, 'utf8');
            if (!src.includes(MARKER)) {
                const hook = `
    ${MARKER}
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        if c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < ${MIN_IOS}
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_IOS}'
        end
      end
    end
`;
                // Append inside the existing post_install block.
                src = src.replace(/(\n\s*post_install do \|installer\|\n)/, `$1${hook}`);
                fs.writeFileSync(podfile, src);
            }
            return cfg;
        },
    ]);
};
