var gulp = require('gulp'),
    del = require('del'),
    seajsCombo = require('../index');
var stream = require('stream');
var delFn = function(cb) {
    return del('./build').then(function() {
        cb && cb();
    });
};
var Vinyl = require('vinyl');
var writeFile = function(fileData) {
    fileData.forEach(function(item) {
        var readable = stream.Readable({
            objectMode: true
        });
        readable._read = function() {
            this.push(new Vinyl({
                path: item.nameId + item.extName,
                contents: new Buffer(item.contents)
            }));
            this.push(null);
        };
        readable.pipe(gulp.dest('build'));
    });
};
var a = function() {
    delFn(function() {
        gulp.src('src/async_a.js')
            .pipe(seajsCombo({
                base: './src',
                ignore: ['b']
            }, function(cons) {
                console.log(cons);
                writeFile(cons);
            }))
            .pipe(gulp.dest('build'));
    });
};
debugger;
a();