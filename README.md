# gulp-fangfis-combo

***
> 一个用于 fangfis(CMD) 模块合并工具的 gulp 插件,支持异步调用模块合并。

## 安装

```
$ npm install --save-dev gulp-fangfis-combo
```

## 使用

``` javascript
var gulp = require( 'gulp' ),
    fangfisCombo = require( 'gulp-fangfis-combo' );

gulp.task( 'fangfisCombo', function(){
    return gulp.src( 'src/js/main.js' )
        .pipe( fangfisCombo() )
        .pipe( gulp.task('build/js') );
});
```

## API

### fangfisCombo( [options,]callback)

对于不支持的文件类型会直接忽略。

### options

#### encoding

Type : `String`

Default : `utf-8`

#### ignore

Type : `Array`

忽略模块列表。合并模块 `main` 时想忽略其以来模块 `global` 和 `common`，那么其配置规则如下：

``` javascript
ignore : [ 'global', 'common' ]
```

忽略配置有两种规则，如果需要忽略 `src/a` 和 `src/test/a` 2 个模块，直接配置不带路径的模块标识：

``` javascript
ignore : [ 'a' ]
```

如果上面两个模块中只想忽略其中一个，那么配置具体的路径：

``` javascript
ignore : [ 'src/test/a' ]
```

#### map

使用 fang.use 时，模块标识为 `foo/bar/biz`，但是模块的文件路径基于 `gulp.src` 解析出来的路径是 `./biz.js`，那么使用 `map` 配置来映射这种关系。

``` javascript
map : {
    'foo/bar/biz' : './biz'
}
```
### callback

所有异步加载的模块，插件会分析该异步模块的依赖模块并进行合并，通过回调的方式以数组的形式回传出来，以便我们做后续操作，下面做一个简单的例子

``` javascript
var gulp = require('gulp');
// 生成文件流
var Vinyl = require('vinyl');
var stream = require('stream');
var writeFile = function (fileData) {
    // 接受回传异步模块数组
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
        readable.pipe(babel()).pipe(gulp.dest('build'));
    });
};

gulp.task('async_a', ['clean'], function () {
    return gulp.src('src/async_a.js')
        .pipe(fangfisCombo(function (cons) {
            // cons Array 数组类型 回传异步模块合并后的异步模块数组
            /*  [ { id: 'async_b',
                    deps: [],
                    path: 'D:\\fang.com\\gulp-fangfis-combo\\test\\src\\async_b.js',
                    asyncMod: true,
                    contents: 'define(\'async_b\',[],function(){\r\n    return \'b\'; \r\n});\n',
                    extName: '.js',
                    origId: './async_b',
                    nameId: 'async_b' } ]
            */
            writeFile(cons)
        }))
        .pipe(gulp.dest('build'));
});

```

## 合并规则

模块 `a.js` :

``` javascript
define(function(){
    var b = require( 'deps/b' );
    return 'a' + ' ' + b;
});
```

模块 `b.js` :

``` javascript
define(function(){
    return 'b';
});
```

gulp 代码 :

``` javascript
gulp.src( 'src/a.js' )
    .pipe( fangfisCombo() )
    ...
```

合并好的 `a.js` :

``` javascript
define('b',function(){
    return 'b';
});
define('a',['b'],function(){
    var b = require( 'b' );
    return 'a' + ' ' + b;
});
```

文件 `main.js` :

``` javascript
fang.use( 'a' );
```

gulp 代码 :

``` javascript
gulp.src( 'src/main.js' )
    .pipe( fangfisCombo() )
    ...
```

合并后的 `main.js` :

``` javascript
define('b',function(){
    return 'b';
});
define('a',['b'],function(){
    var b = require( 'b' );
    return 'a' + ' ' + b;
});
fang.use( 'a' );
```

合并后的模块标识不会保留其路径，`src/a` 的模块标识在合并后就变成了 `a`，`foo/bar/p` 在合并后变成了 `p`。

如果合并的模块中模块标识有重复，gulp-fangfis-combo 会修改原来的模块标识。`src/a` 和 `src/test/a` 在合并后由于去掉了路径都会变成 `a`，gulp-fangfis-combo 会将后一个依赖 `src/test/a` 改成 `axx`。

## 解析 `fang.config`

`gulp-fangfis-combo` 会解析 `fang.config` 中的 `alias` `vars` `paths` 这 3 个配置，其他的配置会忽略，并且配置的值必须为 `String` 类型，会忽略其中的变量。

## License

MIT @ [Fang](https://github.com/fangfis/)
