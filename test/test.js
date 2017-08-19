var fs = require( 'fs' ),
    gulp = require( 'gulp' ),
    should = require( 'should' ),
    gutil = require( 'gulp-util' ),
    assert = require( 'stream-assert' ),
    handlebars = require( 'gulp-handlebars' ),
    seajsCombo = require( '../index' );

describe( 'gulp-fangfis-combo', function(){
    describe( 'seajsCombo()', function(){
        // 测试忽略空文件
        it( 'should ignore null file', function( done ){
            gulp.src( 'hello.js' )
                .pipe( seajsCombo() )
                .pipe( assert.length(0) )
                .pipe( assert.end(done) );
        });

        // 测试普通的模块
        it( 'should combo module a & b, no fang.use', function( done ){
            fs.readFile( 'build/a.js', function( err, buildData ){
                if( err ){
                    throw err;
                }

                gulp.src( 'src/a.js' )
                    .pipe( seajsCombo() )
                    .pipe( assert.first(function( srcData ){
                        srcData.contents.should.eql( buildData );
                    }))
                    .pipe( assert.end(done));
            });
        });

        // 测试普通的模块
        it( 'should combo module s & duplicate/s, module id is duplicate', function( done ){
            fs.readFile( 'build/r.js', function( err, buildData ){
                if( err ){
                    throw err;
                }

                gulp.src( 'src/r.js' )
                    .pipe( seajsCombo() )
                    .pipe( assert.first(function( srcData ){
                        srcData.contents.should.eql( buildData );
                    }))
                    .pipe( assert.end(done));
            });
        });

        // 测试有seajs.use的情况
        it( 'should combo module f, have fang.use', function( done ){
            fs.readFile( 'build/f.js', function( err, buildData ){
                if( err ){
                    throw err;
                }

                gulp.src( 'src/f.js' )
                    .pipe( seajsCombo({
                        map : {
                            'src/g' : './g',
                            'src/h' : './h'
                        }
                    }))
                    .pipe( assert.first(function( srcData ){
                        srcData.contents.should.eql( buildData );
                    }))
                    .pipe( assert.end(done));
            });
        });
    });

    describe( 'options', function(){
        // 测试options.ignore
        it( 'should ignore module e', function( done ){
            fs.readFile( 'build/c.js', function( err, buildData ){
                if( err ){
                    throw err;
                }

                gulp.src( 'src/c.js' )
                    .pipe( seajsCombo({
                        ignore : ['./e']
                    }))
                    .pipe( assert.first(function( srcData ){
                        srcData.contents.should.eql( buildData );
                    }))
                    .pipe( assert.end(done) );
            });
        });

        // 测试options.map
        it( 'should use map', function( done ){
            fs.readFile( 'build/f2.js', function( err, buildData ){
                if( err ){
                    throw err;
                }

            gulp.src( 'src/f2.js' )
                .pipe( seajsCombo({
                    map : {
                        'src/g' : './g',
                        'src/h' : './h'
                    }
                }))
                .pipe( assert.first(function( srcData ){
                    srcData.contents.should.eql( buildData );
                }))
                .pipe( assert.end(done) );
            });
        });
    });

    describe( 'fang.config', function(){
        // 测试解析fang.config中的配置
        it( 'should parse alias & paths & vars in fang.config', function( done ){
            fs.readFile( 'build/m.js', function( err, buildData ){
                if( err ){
                    throw err;
                }

                gulp.src( 'src/m.js' )
                    .pipe( seajsCombo() )
                    .pipe( assert.first(function( srcData ){
                        srcData.contents.should.eql( buildData );
                    }))
                    .pipe( assert.end(done) );
            });
        });

        // 测试解析fang.config中的配置
        it( 'should parse map & module have modId', function( done ){
            fs.readFile( 'build/k.js', function( err, buildData ){
                if( err ){
                    throw err;
                }

                gulp.src( 'src/k.js' )
                    .pipe( seajsCombo({
                        map : {
                            'src/l' : './l'
                        }
                    }))
                    .pipe( assert.first(function( srcData ){
                        srcData.contents.should.eql( buildData );
                    }))
                    .pipe( assert.end(done) );
            });
        });
    });

    describe( 'require.async', function(){
        // 测试解析异步模块
        it( 'should async_a.js callback output module async_b, no fang.use', function( done ){
            fs.readFile( 'build/async_a.js', function( err, buildData ){
                if( err ){
                    throw err;
                }
                gulp.src( 'src/async_a.js' )
                    .pipe( seajsCombo() )
                    .pipe( assert.first(function( srcData ){
                        srcData.contents.should.eql( buildData );
                    }))
                    .pipe( assert.end(done) );
            });
            fs.readFile( 'build/async_b.js', function( err, buildData ){
                if( err ){
                    throw err;
                }

                gulp.src( 'src/async_a.js' )
                    .pipe( seajsCombo(function (cons) {
                        new Buffer(cons[0].contents).should.eql( buildData );
                    }) );
            });
        });

         // 测试解析异步数组加载模块
         it( 'should async_c callback output module async_d async_e, no fang.use', function( done ){
            fs.readFile( 'build/async_c.js', function( err, buildData ){
                if( err ){
                    throw err;
                }
                gulp.src( 'src/async_c.js' )
                    .pipe( seajsCombo() )
                    .pipe( assert.first(function( srcData ){
                        srcData.contents.should.eql( buildData );
                    }))
                    .pipe( assert.end(done) );
            });

            var readFile = function (filePath) {
                return new Promise(function (resolve,reject) {
                    fs.readFile( filePath, function( err, buildData ){
                        if( err ){
                            throw err;
                        }
                        resolve(buildData);
                    });
                });
            };
            Promise.all([readFile('build/async_d.js'),readFile('build/async_e.js')]).then(function (data) {
                var dData = data[0],eData=data[1];
                gulp.src( 'src/async_c.js' )
                .pipe( seajsCombo(function (cons) {
                    new Buffer(cons[0].contents).should.eql( eData );
                    new Buffer(cons[1].contents).should.eql( dData );
                }) );
            });
        });
    });
});
