'use-script';

var connectLr         = require('connect-livereload'),
    express           = require('express'),
    app               = express(),
    expressPort       = 4000,
    expressRoot       = require('path').resolve('./.tmp'),
    gulp              = require('gulp'),
    liveReloadPort    = 35729,
    lrServer          = require('tiny-lr')(),
    permitIndexReload = true,
    plugins           = require('gulp-load-plugins')(),
    publicDir         = require('path').resolve('./dist'),
    source            = require('vinyl-source-stream'),
    watchify          = require('watchify');


function startExpress() {
  app.use(connectLr());
  app.use(express.static(expressRoot));
  app.listen(expressPort);
}

function startLiveReload() {
  lrServer.listen(liveReloadPort, function(err) {
    if (err) {
      return console.log(err);
    }
  });
}

function notifyLivereload(fileName) {
  if (fileName !== 'index.html' || permitIndexReload) {
    lrServer.changed({ body: { files: [fileName] } });

    if (fileName === 'index.html') {
      permitIndexReload = false;
      setTimeout(function() { permitIndexReload = true; }, 5000);
    }
  }
}

function clean(relativePath, cb) {
  plugins.util.log('Cleaning: ' + plugins.util.colors.blue(relativePath));

  gulp
    .src([(publicDir + relativePath), (expressRoot + relativePath)], {read: false})
    .pipe(plugins.rimraf({force: true}))
    .on('end', cb || function() {});
}

function scripts(cb) {
  var bundler = watchify('./src/app/app.js');

  function rebundle() {
    clean('/app/*.js', function() {
      plugins.util.log('Rebuilding application JS bundle');

      return bundler.bundle({ debug: true})
        .pipe(source('app.js'))
        .pipe(gulp.dest(expressRoot + '/app'))
        .pipe(plugins.streamify(plugins.uglify({ mangle: false })))
        .pipe(plugins.streamify(plugins.size({ showFiles: true })))
        .pipe(gulp.dest(publicDir + '/app'))
        .on('end', cb || function() {})
        .on('error', plugins.util.log);
    });

  }
  bundler.on('update', rebundle);
  bundler.on('error', plugins.util.log);
  rebundle();
}

function styles(cb) {
  clean('/scripts/templates*.js', function() {
    plugins.util.log('Rebuilding templates');

    gulp.src('app/views/**/*.html')
      .pipe(plugins.angularTemplatecache({
        root:   'views/',
        module: 'clientApp'
      }))
      .pipe(plugins.streamify(plugins.rev()))
      .pipe(gulp.dest(expressRoot + '/scripts'))
      .pipe(gulp.dest(publicDir + '/scripts'))
      .on('end', cb || function() {})
      .on('error', plugins.util.log);
  });
}

function templates(cb) {
  clean('/app/templates*.js', function() {
    plugins.util.log('Rebuilding templates');

    gulp.src('app/**/*.html')
      .pipe(plugins.angularTemplatecache({
        root: 'views/',
        module: 'stories-with-friends'
      }))
      .pipe(plugins.streamify(plugins.rev()))
      .pipe(gulp.dest(expressRoot + '/app'))
      .pipe(gulp.dest(publicDir + '/app'))
      .on('end', cb)
      .on('error', plugins.util.log)
  });
}

function shims(cb) {
  cb();
}

function vendor(cb) {
  clean('/scripts/vendor*.js', function() {
    plugins.util.log('Rebuilding vendor JS bundle');

    gulp.src(require('./app/vendor'))
      .pipe(plugins.concat('vendor.js'))
      .pipe(plugins.streamify(plugins.uglify({ mangle: false })))
      .pipe(plugins.streamify(plugins.rev()))
      .pipe(plugins.size({ showFiles: true }))
      .pipe(gulp.dest(expressRoot + '/scripts'))
      .pipe(gulp.dest(publicDir + '/scripts'))
      .on('end', cb || function() {})
      .on('error', plugins.util.log);
  });
}

function images(cb) {
  clean('/images', function() {
    plugins.util.log('Minifying images');

    gulp.src('app/images/**/*.*')
      .pipe(plugins.imagemin())
      .pipe(plugins.size({ showFiles: true }))
      .pipe(gulp.dest(expressRoot + '/images'))
      .pipe(gulp.dest(publicDir + '/images'))
      .on('end', cb || function() {})
      .on('error', plugins.util.log);
  });
}

function fonts(cb) {
  clean('/styles/fonts/icons', function() {
    plugins.util.log('Copying fonts');

    gulp.src('app/styles/fonts/icons/*.*')
      .pipe(gulp.dest(publicDir + '/styles/fonts/icons'))
      .pipe(gulp.dest(expressRoot + '/styles/fonts/icons'))
      .on('end', cb || function() {})
      .on('error', plugins.util.log);
  });
}

function indexHtml(cb) {
  plugins.util.log('Rebuilding index.html');

  function inject(glob, path, tag) {
    return plugins.inject(
      gulp.src(glob, {
        cwd: path
      }), {
        starttag: '<!-- inject:' + tag + ':{{ext}} -->'
      }
    );
  }

  function buildIndex(path, cb) {
    gulp.src('app/index.html')
      .pipe(inject('./styles/app*.css', path, 'app-style'))
      .pipe(inject('./scripts/shim*.js', path, 'shim'))
      .pipe(inject('./scripts/vendor*.js', path, 'vendor'))
      .pipe(inject('./scripts/app*.js', path, 'app'))
      .pipe(inject('./scripts/templates*.js', path, 'templates'))
      .pipe(gulp.dest(path))
      .on('end', cb || function() {})
      .on('error', plugins.util.log);
  }

  buildIndex(expressRoot, cb || function(){});
  buildIndex(publicDir, function(){});
}

gulp.task('vendor', function () {
  vendor(indexHtml);
});

gulp.task('default', function () {
  startExpress();
  startLiveReload();
  fonts();
  images();
  styles(indexHtml);
  templates(indexHtml);
  shims(indexHtml);
  scripts(function() {
    indexHtml(function() {
      notifyLivereload('index.html');
    });
  });

  gulp.watch('src/scripts/shims.js', function() {
    shims(function() {
      indexHtml(function() {
        notifyLivereload('index.html');
      });
    });
  });

  gulp.watch(['src/styles/**/*', '!src/styles/fonts/**/*'], function() {
    styles(function() {
      indexHtml(function() {
        notifyLivereload('styles/app.css');
      });
    });
  });

  gulp.watch('src/styles/fonts/**/*', function() {
    fonts(function() {
      styles(function() {
        indexHtml(function() {
          notifyLivereload('styles/app.css');
        });
      });
    });
  });

  gulp.watch('src/images/**/*', function() {
    images(function() {
      indexHtml(function() {
        notifyLivereload('index.html');
      });
    });
  });

  gulp.watch('app/views/**/*', function() {
    templates(function() {
      indexHtml(function() {
        notifyLivereload('index.html');
      });
    });
  });

  gulp.watch('src/index.html', function() {
    indexHtml(function() {
      notifyLivereload('index.html');
    });
  });
});
