Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'FreshRun Live Activity bridge (ActivityKit start/update/end)'
  s.description    = 'Local Expo module: the JS-to-ActivityKit bridge for the run session Live Activity.'
  s.author         = 'FreshRun'
  s.homepage       = 'https://github.com/Fresh-Run/FE'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = '**/*.{h,m,swift}'
end
