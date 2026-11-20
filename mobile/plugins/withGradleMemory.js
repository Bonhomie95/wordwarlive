// Config plugin: give the Gradle daemon more heap and metaspace. The template's
// 512m metaspace runs out when release lint analyses many modules at once
// ("Metaspace" in lintVitalAnalyzeRelease) on local builds.
const { withGradleProperties } = require('expo/config-plugins');

const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1024m';

module.exports = function withGradleMemory(config) {
    return withGradleProperties(config, (cfg) => {
        cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === 'org.gradle.jvmargs'));
        cfg.modResults.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
        return cfg;
    });
};
