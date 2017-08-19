var gulp = require('gulp'),
    del = require('del'),
    seajsCombo = require('../index');

var Vinyl = require('vinyl');
var stream = require('stream');
var writeFile = function (fileData) {
    fileData.forEach(function (item) {
        var readable = stream.Readable({
            objectMode: true
        });
        readable._read = function () {
            this.push(new Vinyl({
                path: item.nameId + item.extName,
                contents: new Buffer(item.contents)
            }));
            this.push(null);
        };
        readable.pipe(gulp.dest('build'));
    });
};

gulp.task('clean', function () {
    return del('./build/**/*.*');
});
gulp.task('a', ['clean'], function () {
    return gulp.src('src/a.js')
        .pipe(seajsCombo())
        .pipe(gulp.dest('build'));
});

gulp.task('c', ['clean'], function () {
    return gulp.src('src/c.js')
        .pipe(seajsCombo({
            ignore: ['e']
        }))
        .pipe(gulp.dest('build'));
});

gulp.task('f', ['clean'], function () {
    return gulp.src('src/f.js')
        .pipe(seajsCombo({
            map: {
                'src/g': './g',
                'src/h': './h'
            }
        }))
        .pipe(gulp.dest('build'));
});

gulp.task('f2', ['clean'], function () {
    return gulp.src('src/f2.js')
        .pipe(seajsCombo({
            map: {
                'src/g': './g',
                'src/h': './h'
            }
        }))
        .pipe(gulp.dest('build'));
});

gulp.task('k', ['clean'], function () {
    return gulp.src('src/k.js')
        .pipe(seajsCombo({
            map: {
                'src/l': './l'
            }
        }))
        .pipe(gulp.dest('build'));
});

gulp.task('m', ['clean'], function () {
    return gulp.src('src/m.js')
        .pipe(seajsCombo())
        .pipe(gulp.dest('build'));
});



gulp.task('r', ['clean'], function () {
    return gulp.src('src/r.js')
        .pipe(seajsCombo())
        .pipe(gulp.dest('build'));
});

gulp.task('async_a', ['clean'], function () {
    return gulp.src('src/async_a.js')
        .pipe(seajsCombo(function (cons) {
            writeFile(cons)
        }))
        .pipe(gulp.dest('build'));
});

gulp.task('async_c', ['clean'], function () {
    return gulp.src('src/async_c.js')
        .pipe(seajsCombo(function (cons) {
            writeFile(cons)
        }))
        .pipe(gulp.dest('build'));
});

gulp.task('default', ['a', 'c', 'f', 'f2', 'k', 'm', 'r','async_a','async_c']);