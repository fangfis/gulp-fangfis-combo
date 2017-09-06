var gulp = require('gulp');
var del = require('del');
var seajsCombo = require('../index');
var stream = require('stream');
var delFn = function (cb) {
    return del('./build').then(function () {
        cb && cb();
    });
};
var Vinyl = require('vinyl');
var writeFile = function (fileData) {
    fileData.forEach(function (item) {
        var readable = stream.Readable({
            objectMode: true
        });
        readable._read = function () {
            this.push(new Vinyl({
                path: item.path,
                base: 'dev/js',
                contents: new Buffer(item.contents)
            }));
            this.push(null);
        };

        readable.pipe(gulp.dest('build'));
        // gulp.src(item.path,{base:'dev'}).pipe(gulp.dest('build'));
    });
};
var a = function () {
    delFn(function () {
        gulp
            .src(['/Users/tankunpeng/WebSite/gulp-fangfis-combo/test/dev/js/modules/channel/main.js'], {
                base: 'dev/js'
            })
            .pipe(seajsCombo({
                base: 'dev/js',
                ignore: ['jquery'],
                config: {
                    alias: {
                        jquery: 'jquery',
                        util: 'plugins/util',
                        BMapLib:'bmap/BMapLib-min'
                    },
                    paths: {
                        count: '//js.soufunimg.com',
                        webim: '//js.soufunimg.com/webim'
                    }
                }
            }, function (cons) {
                // console.log(cons);
                writeFile(cons);
            }))
            .pipe(gulp.dest('build'));
    });
};
debugger;
a();