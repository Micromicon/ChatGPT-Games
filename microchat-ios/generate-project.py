#!/usr/bin/env python3
"""Generate the checked-in Xcode project; no XcodeGen or CocoaPods is needed."""
from pathlib import Path
import hashlib
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
objects = {}

def identity(label):
    return hashlib.sha1(('MicroChat-ios:' + label).encode()).hexdigest()[:24].upper()

def add(label, isa, **values):
    key = identity(label)
    objects[key] = dict(isa=isa, **values)
    return key

def plist(value, level=0):
    if isinstance(value, dict):
        return '{\n' + ''.join('\t' * (level + 1) + json.dumps(str(k)) + ' = ' + plist(v, level + 1) + ';\n' for k, v in value.items()) + '\t' * level + '}'
    if isinstance(value, list):
        return '(' + ', '.join(plist(v, level) for v in value) + (',' if value else '') + ')'
    if isinstance(value, int):
        return str(value)
    return json.dumps(str(value), ensure_ascii=True)

app_id, test_id, project_id = map(identity, ['app', 'tests', 'project'])
app_sources, app_resources, test_sources, test_resources, refs = [], [], [], [], []
for source in sorted([*ROOT.glob('Core/*.swift'), *ROOT.glob('App/*.swift'), *ROOT.glob('Tests/*.swift')]):
    path = source.relative_to(ROOT).as_posix()
    ref = add('ref:' + path, 'PBXFileReference', lastKnownFileType='sourcecode.swift', path=path, sourceTree='<group>')
    refs.append(ref)
    build = add('build:' + path, 'PBXBuildFile', fileRef=ref)
    (test_sources if path.startswith('Tests/') else app_sources).append(build)
for path, filetype, dest in [('App/Assets.xcassets', 'folder.assetcatalog', app_resources),
                              ('App/service-config.json', 'text.json', app_resources),
                              ('App/PrivacyInfo.xcprivacy', 'text.xml', app_resources),
                              ('Tests/Fixtures', 'folder', test_resources)]:
    ref = add('ref:' + path, 'PBXFileReference', lastKnownFileType=filetype, path=path, sourceTree='<group>')
    refs.append(ref)
    dest.append(add('build:' + path, 'PBXBuildFile', fileRef=ref))
info = add('info', 'PBXFileReference', lastKnownFileType='text.plist.xml', path='App/Info.plist', sourceTree='<group>')
refs.append(info)
app_product = add('product:app', 'PBXFileReference', explicitFileType='wrapper.application', includeInIndex=0, path='MicroChat.app', sourceTree='BUILT_PRODUCTS_DIR')
test_product = add('product:tests', 'PBXFileReference', explicitFileType='wrapper.cfbundle', includeInIndex=0, path='MicroChatTests.xctest', sourceTree='BUILT_PRODUCTS_DIR')
products = add('products', 'PBXGroup', children=[app_product, test_product], name='Products', sourceTree='<group>')
main = add('root', 'PBXGroup', children=refs + [products], sourceTree='<group>')

def phase(label, isa, files):
    return add(label, isa, buildActionMask=2147483647, files=files, runOnlyForDeploymentPostprocessing=0)

def configs(label, common, debug=None, release=None):
    ids = []
    for name, extra in [('Debug', debug or {}), ('Release', release or {})]:
        ids.append(add(label + ':' + name, 'XCBuildConfiguration', name=name, buildSettings=common | extra))
    return add(label + ':list', 'XCConfigurationList', buildConfigurations=ids, defaultConfigurationIsVisible=0, defaultConfigurationName='Release')

base = dict(SWIFT_VERSION='5.0', IPHONEOS_DEPLOYMENT_TARGET='17.0', SDKROOT='iphoneos',
            CLANG_ENABLE_MODULES='YES', CLANG_ENABLE_OBJC_ARC='YES', SWIFT_STRICT_CONCURRENCY='targeted',
            ENABLE_USER_SCRIPT_SANDBOXING='YES', DEVELOPMENT_TEAM='', CODE_SIGN_STYLE='Automatic')
project_config = configs('project-config', base,
                         dict(SWIFT_OPTIMIZATION_LEVEL='-Onone', DEBUG_INFORMATION_FORMAT='dwarf', ENABLE_TESTABILITY='YES', SWIFT_ACTIVE_COMPILATION_CONDITIONS='DEBUG'),
                         dict(SWIFT_OPTIMIZATION_LEVEL='-O', DEBUG_INFORMATION_FORMAT='dwarf-with-dsym', VALIDATE_PRODUCT='YES'))
app_config = configs('app-config', dict(PRODUCT_BUNDLE_IDENTIFIER='com.microchat.app', PRODUCT_NAME='MicroChat',
    INFOPLIST_FILE='App/Info.plist', GENERATE_INFOPLIST_FILE='NO', CURRENT_PROJECT_VERSION='5', MARKETING_VERSION='0.5',
    TARGETED_DEVICE_FAMILY='1', SUPPORTS_MACCATALYST='NO', ASSETCATALOG_COMPILER_APPICON_NAME='AppIcon',
    ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME='AccentColor',
    LD_RUNPATH_SEARCH_PATHS=['$(inherited)', '@executable_path/Frameworks']))
test_config = configs('test-config', dict(PRODUCT_BUNDLE_IDENTIFIER='com.microchat.app.tests', PRODUCT_NAME='MicroChatTests',
    GENERATE_INFOPLIST_FILE='YES', TARGETED_DEVICE_FAMILY='1', TEST_HOST='$(BUILT_PRODUCTS_DIR)/MicroChat.app/MicroChat',
    BUNDLE_LOADER='$(TEST_HOST)', LD_RUNPATH_SEARCH_PATHS=['$(inherited)', '@executable_path/Frameworks', '@loader_path/Frameworks']))
app_phases = [phase('app-sources', 'PBXSourcesBuildPhase', app_sources), phase('app-frameworks', 'PBXFrameworksBuildPhase', []), phase('app-resources', 'PBXResourcesBuildPhase', app_resources)]
test_phases = [phase('test-sources', 'PBXSourcesBuildPhase', test_sources), phase('test-frameworks', 'PBXFrameworksBuildPhase', []), phase('test-resources', 'PBXResourcesBuildPhase', test_resources)]
proxy = add('proxy', 'PBXContainerItemProxy', containerPortal=project_id, proxyType=1, remoteGlobalIDString=app_id, remoteInfo='MicroChat')
dependency = add('dependency', 'PBXTargetDependency', target=app_id, targetProxy=proxy)
add('app', 'PBXNativeTarget', name='MicroChat', buildConfigurationList=app_config, buildPhases=app_phases,
    buildRules=[], dependencies=[], productName='MicroChat', productReference=app_product, productType='com.apple.product-type.application')
add('tests', 'PBXNativeTarget', name='MicroChatTests', buildConfigurationList=test_config, buildPhases=test_phases,
    buildRules=[], dependencies=[dependency], productName='MicroChatTests', productReference=test_product, productType='com.apple.product-type.bundle.unit-test')
add('project', 'PBXProject', attributes=dict(BuildIndependentTargetsInParallel='YES', LastUpgradeCheck='1600',
    TargetAttributes={app_id: dict(CreatedOnToolsVersion='16.0'), test_id: dict(CreatedOnToolsVersion='16.0', TestTargetID=app_id)}),
    buildConfigurationList=project_config, compatibilityVersion='Xcode 14.0', developmentRegion='ru', hasScannedForEncodings=0,
    knownRegions=['ru', 'en', 'Base'], mainGroup=main, productRefGroup=products, projectDirPath='', projectRoot='', targets=[app_id, test_id])

project = ROOT / 'MicroChat.xcodeproj'
project.mkdir(exist_ok=True)
(project / 'project.pbxproj').write_text('// !$*UTF8*$!\n' + plist(dict(archiveVersion=1, classes={}, objectVersion=56, objects=objects, rootObject=project_id)) + '\n')

scheme = ET.Element('Scheme', LastUpgradeVersion='1600', version='1.3')
build = ET.SubElement(scheme, 'BuildAction', parallelizeBuildables='YES', buildImplicitDependencies='YES')
entries = ET.SubElement(build, 'BuildActionEntries')
def ref(parent, target, name):
    return ET.SubElement(parent, 'BuildableReference', BuildableIdentifier='primary', BlueprintIdentifier=target,
                         BuildableName=name, BlueprintName='MicroChat' if target == app_id else 'MicroChatTests', ReferencedContainer='container:MicroChat.xcodeproj')
for target, name in [(app_id, 'MicroChat.app'), (test_id, 'MicroChatTests.xctest')]:
    entry = ET.SubElement(entries, 'BuildActionEntry', buildForTesting='YES', buildForRunning='YES' if target == app_id else 'NO',
        buildForProfiling='YES' if target == app_id else 'NO', buildForArchiving='YES' if target == app_id else 'NO', buildForAnalyzing='YES')
    ref(entry, target, name)
test = ET.SubElement(scheme, 'TestAction', buildConfiguration='Debug', selectedDebuggerIdentifier='Xcode.DebuggerFoundation.Debugger.LLDB', selectedLauncherIdentifier='Xcode.IDEFoundation.Launcher.LLDB', shouldUseLaunchSchemeArgsEnv='YES')
ref(ET.SubElement(test, 'MacroExpansion'), app_id, 'MicroChat.app')
ref(ET.SubElement(ET.SubElement(test, 'Testables'), 'TestableReference', skipped='NO'), test_id, 'MicroChatTests.xctest')
launch = ET.SubElement(scheme, 'LaunchAction', buildConfiguration='Debug', selectedDebuggerIdentifier='Xcode.DebuggerFoundation.Debugger.LLDB', selectedLauncherIdentifier='Xcode.IDEFoundation.Launcher.LLDB', launchStyle='0', useCustomWorkingDirectory='NO', ignoresPersistentStateOnLaunch='NO', debugDocumentVersioning='YES', debugServiceExtension='internal', allowLocationSimulation='YES')
ref(ET.SubElement(launch, 'BuildableProductRunnable', runnableDebuggingMode='0'), app_id, 'MicroChat.app')
profile = ET.SubElement(scheme, 'ProfileAction', buildConfiguration='Release', shouldUseLaunchSchemeArgsEnv='YES', savedToolIdentifier='', useCustomWorkingDirectory='NO', debugDocumentVersioning='YES')
ref(ET.SubElement(profile, 'BuildableProductRunnable', runnableDebuggingMode='0'), app_id, 'MicroChat.app')
ET.SubElement(scheme, 'AnalyzeAction', buildConfiguration='Debug')
ET.SubElement(scheme, 'ArchiveAction', buildConfiguration='Release', revealArchiveInOrganizer='YES')
directory = project / 'xcshareddata/xcschemes'
directory.mkdir(parents=True, exist_ok=True)
ET.indent(scheme)
ET.ElementTree(scheme).write(directory / 'MicroChat.xcscheme', encoding='UTF-8', xml_declaration=True)
print('Generated MicroChat.xcodeproj (app + hosted protocol tests).')
