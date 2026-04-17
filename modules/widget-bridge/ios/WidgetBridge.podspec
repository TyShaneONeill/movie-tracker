Pod::Spec.new do |s|
  s.name           = 'WidgetBridge'
  s.version        = '0.1.0'
  s.summary        = 'Expo module for writing data to App Groups shared container and triggering WidgetKit reloads'
  s.description    = 'Writes widget_data.json and poster image files to the App Groups container, and calls WidgetCenter.shared.reloadTimelines.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platform       = :ios, '16.0'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
