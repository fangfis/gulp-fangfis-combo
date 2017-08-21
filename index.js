/*
 * fangfis(CMD) Module combo pulgin for gulp
 * Date : 2017-08-17
 */

var fs = require('fs'),
    path = require('path'),
    through = require('through2'),
    chalk = require('chalk'),
    // rFirstStr = /[\s\r\n\=]/,
    rDefine = /define\(\s*(['"].+?['"],(\s*\[[\s\S]*?(['"].*[\s\S]*?.*['"])?[\s\S]*?\]\s*,)?)?/,
    rDeps = /(['"])(.+?)\1/g,
    rAlias = /alias\s*\:([^\}]+)\}/,
    rPaths = /paths\s*\:([^\}]+)\}/,
    rVars = /vars\s*\:([^\}]+)\}/,
    rVar = /\{([^{]+)}/g,
    rSeajsConfig = /fang\.config\([^\)]+\);?/g,
    rModId = /([^\\\/?]+?)(\.(?:js))?([\?#].*)?$/,
    rQueryHash = /[\?#].*$/,
    rSeajsUse = /"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|\/\*[\S\s]*?\*\/|\/(?:\\\/|[^\/\r\n])+\/(?=[^\/])|\/\/.*|\.\s*fang\(|(?:^|[^$])\bfang\((.+)/g,
    rComments = /([^'"`(${.+})?]\/\/.*)|(\/\*[\s\S]*?\*\/)/g,

    rRequire = /[^.]\s*require\s*\(\s*(\[*(\s*["'][^'"\s]+["'][\s,\s]*)+\]*)\s*\)/g,
    rRequireAsync = /[^.]\s*require\.async\s*\(\s*(\[*(\s*["'][^'"\s]+["'][\s,\s]*)+\]*)\s*\)/g;

const PLUGIN_NAME = 'gulp-fangfis-cmobo';

/*
 * 过滤忽略模块
 * param { Array } 忽略模块列表
 * param { String } 模块名
 * param { String } 模块标识
 * return { Boolean } 是否在忽略列表中
 */
var filterIgnore = function(ignore, id, origId) {
        return ignore.some(function(item) {
            var arr;

            // 含路径的模块id只过滤精确匹配的结果
            if (~item.indexOf('/')) {
                return item === origId;
            }
            // 不含路径的模块id将过滤所有匹配结果
            // ui 将匹配 ../ui 和 ../../ui
            else {
                // 使用id过滤忽略模块时要去掉自动添加的 gulp-fangfis-combo
                if (~id.indexOf(PLUGIN_NAME)) {
                    arr = id.split('_');
                    id = arr.slice(0, -2).join('_');
                }

                return item === id;
            }
        });
    },

    /*
     * 提取config中的配置，会忽略包含变量的配置，只提取纯字符串
     * param{ String } config字符串
     * return{ Object } 提取出来的配置
     */
    evalConfig = function(configStr) {
        var configArr = configStr,
            config = {};

        configStr = configStr.replace(/\{/, '');
        configArr = configStr.split(',');

        configArr.forEach(function(item) {
            var index, arr, key, value;

            index = item.indexOf(':');
            key = item.slice(0, index).replace(/['"]/g, '');
            value = item.slice(index + 1);

            key = key.trim();
            value = value.trim();

            try {
                value = eval('(function(){return ' + value + '})()');
                config[key] = value;
            } catch (_) {}
        });

        return config;
    },

    /*
     * 解析config字符串，尝试提取alias、paths、vars
     * param{ String } 文件内容
     * return{ Object } 提取出来的配置和提取后的文件内容
     */
    parseConfig = function(contents) {
        var config = {};

        contents = contents.replace(rSeajsConfig, function($) {
            $.replace(rAlias, function(_, $1) {
                config.alias = evalConfig($1);
            });

            $.replace(rPaths, function(_, $1) {
                config.paths = evalConfig($1);
            });

            $.replace(rVars, function(_, $1) {
                config.vars = evalConfig($1);
            });

            return '';
        });

        return {
            contents: contents,
            config: config
        };
    },

    /*
     * 基于base将依赖模块的相对路径转化成绝对路径
     * 同时对seajs.config中的paths、alias、vars，还有options.map进行处理
     * param { Object } 数据存储对象
     * param { Array } 依赖模块的相对路径列表
     * param { String } 基础路径
     * return { Array } 依赖模块的绝对路径列表
     */
    mergePath = function(options, deps, base) {
        var config = options.config;

        return deps.map(function(item, i) {
            var origId = item.origId,
                arr, modId;

            // 防止多次merge
            if (item.path) {
                return;
            }

            // 处理build.json => map
            if (options.map && options.map[origId]) {
                origId = options.map[origId];
            }

            // 处理seajs.config => vars
            if (config.vars) {
                if (~origId.indexOf('{')) {
                    origId = origId.replace(rVar, function($, $1) {
                        if (config.vars[$1]) {
                            return config.vars[$1];
                        }

                        return $;
                    });
                }
            }

            // 处理seajs.config => alias
            if (config.alias && config.alias[origId]) {
                origId = config.alias[origId];
            }

            // 处理seajs.config => paths
            if (config.paths) {
                arr = origId.split('/');
                modId = arr.splice(arr.length - 1, 1);

                arr.forEach(function(_item, i) {
                    if (config.paths[_item]) {
                        arr[i] = config.paths[_item];
                    }
                });

                arr = arr.concat(modId);
                origId = arr.join('/');
            }

            return {
                id: item.id,
                extName: item.extName,
                path: origId.slice(0, 4) === 'http' || origId.slice(0, 2) === '//'?origId:path.resolve(base, origId),
                origId: origId
            };
        });
    },

    /*
     * 解析模块标识
     * param { Object } 配置参数
     * param { String } 模块标识
     * return { Object } filePath: 过滤query和hash后的模块标识,id: 模块id,extName: 模块后缀
     */
    modPathResolve = function(options, filePath) {
        // 过滤query(?)和hash(#)
        filePath = filePath.replace(rQueryHash, '');

        var id = filePath.match(rModId)[1],
            extName = path.extname(filePath);

        if (extName && extName === '.js') {
            id = id.replace(extName, '');
        }
        return {
            id: id,
            path: filePath,
            extName: extName
        };
    },

    /*
     * 解析基于基本路径的模块真實路徑
     * param { string } 路徑
     * param { string } 基本路徑
     * param { promise }
     */
    getorigPath = function(filePath, base) {
        var extName = path.extname(filePath);
        var pt = path.resolve(base, filePath);
        if (!extName) pt = pt + '.js';
        return pt
    },

    /*
     * 删除代码注释
     * param { string } 代码字符串
     * param { promise }
     */
    deleteCodeComments = function(code) {
        // 另一种思路更简便的办法
        // 将'://'全部替换为特殊字符，删除注释代码后再将其恢复回来
        var tmp1 = ':\/\/';
        var regTmp1 = /:\/\//g;
        var tmp2 = '@:@/@/@';
        var regTmp2 = /@:@\/@\/@/g;
        code = code.replace(regTmp1, tmp2);
        code = code.replace(rComments, '');
        result = code.replace(regTmp2, tmp1);
        return result;
    },

    /*
     * 解析依赖模块列表，如果有依赖模块则开始解析依赖模块
     * param { Object } 配置参数
     * param { Array } 依赖模块
     * param { promise }
     */
    readDeps = function(options, parentDeps) {
        var childDeps = [];

        var promiseArr = parentDeps.map(function(item) {
            return new Promise(function(resolve, reject) {
                var id = item.id,
                    extName = item.extName,
                    filePath = item.path,
                    origId = item.origId,
                    contents, stream, plugins, deps, isIgnore;

                isIgnore = options.ignore ?
                    filterIgnore(options.ignore, id, origId) :
                    false;

                // 检测该模块是否在忽略列表中
                if (isIgnore) {
                    options.modArr.push({
                        id: id,
                        path: filePath,
                        contents: '',
                        extName: extName,
                        origId: origId
                    });

                    resolve();
                    return;
                }

                // 处理普通的js模块
                if (!extName && filePath.slice(-3) !== '.js') {
                    filePath += '.js';
                }

                try {
                    contents = fs.readFileSync(filePath, options.encoding);
                } catch (_) {
                    reject('File [' + filePath + '] not found.');
                    return;
                }

                deps = parseDeps(options, contents, item);
                if (deps.length) {
                    childDeps = childDeps.concat(deps);
                }

                resolve();
            });
        });

        return Promise.all(promiseArr).then(function() {
                if (childDeps.length) {
                    return readDeps(options, childDeps);
                }
            }, function(err) {
                console.log(chalk.red(PLUGIN_NAME + ' Error: ' + err));
            })
            .catch(function(err) {
                console.log(chalk.red(PLUGIN_NAME + ' error: ' + err.message));
                console.log(err.stack);
            });
    },

    /*
     * 提取依赖模块
     * param { Object } 配置参数
     * param { RegExp } 提取正则
     * param { Object } 文件内容
     * return { Array } 依赖模块列表
     */
    pullDeps = function(options, reg, contents) {
        var deps = [],
            matches, origId, depPathResult;

        reg.lastIndex = 0;
        // 删除代码注释
        contents = deleteCodeComments(contents);
        contents.replace(reg, function(m, m1) {
            if (m1) {
                m1 = eval(m1);
                if (typeof m1 === 'string') {
                    origId = m1;
                    if (origId && origId.slice(0, 4) !== 'http' && origId.slice(0, 2) !== '//') {
                        depPathResult = modPathResolve(options, origId);
                        deps.unshift({
                            id: depPathResult.id,
                            origId: depPathResult.path,
                            extName: depPathResult.extName
                        });
                    }
                } else if (Array.isArray(m1)) {
                    for (var i = 0; i < m1.length; i++) {
                        origId = m1[i];
                        if (origId && origId.slice(0, 4) !== 'http' && origId.slice(0, 2) !== '//') {
                            depPathResult = modPathResolve(options, origId);
                            deps.unshift({
                                id: depPathResult.id,
                                origId: depPathResult.path,
                                extName: depPathResult.extName
                            });
                        }
                    }
                }
            }
        });
        return deps;
    },

    /*
     * 解析依赖模块
     * param { Object } 配置参数
     * param { String } 文件内容
     * param { Object } 模块数据
     * return { Array } 依赖模块数据列表
     */
    parseDeps = function(options, contents, modData) {
        var isSeajsUse = !!~contents.indexOf('fang.use('),
            id = modData.id,
            deps = [],
            asyncDeps = [],
            configResult, name, base, matches;

        // 标准模块
        if (!isSeajsUse) {
            deps = pullDeps(options, rRequire, contents);
            asyncDeps = pullDeps(options, rRequireAsync, contents);
        }
        // 解析seajs.use
        else {
            configResult = parseConfig(contents);
            contents = configResult.contents;

            for (name in configResult.config) {
                options.config[name] = configResult.config[name];
            }

            matches = contents.match(rSeajsUse);

            matches.forEach(function(item) {
                var _deps = [];

                if (~item.indexOf('fang.use')) {
                    _deps = pullDeps(options, rDeps, item);
                    deps = deps.concat(_deps);
                }
            });
        }

        base = options.base || path.resolve(modData.path, '..');
        deps = mergePath(options, deps, base);
        asyncDeps = mergePath(options, asyncDeps, base);

        options.modArr.push({
            id: id,
            deps: deps,
            path: modData.path,
            asyncMod: modData.asyncMod,
            contents: contents,
            extName: modData.extName,
            origId: modData.origId || id
        });
        options.asyncTemMod.push(...asyncDeps);
        return deps;
    },

    /*
     * 转换模块内容
     * param { Object } 配置参数
     * param { Object } 模块数据
     * return { String } 文件内容
     */
    transform = function(options, modData) {
        var contents = modData.contents,
            isSeajsUse = !!~contents.indexOf('fang.use('),
            origId = modData.origId,
            asyncMod = modData.asyncMod,
            filePath = modData.path,
            fileIdMap = options.fileIdMap,
            deps = [];
        var base = options.base || path.resolve(modData.path, '..');
        // 删除代码注释
        contents = deleteCodeComments(contents);
        // 标准模块
        if (!isSeajsUse) {
            // 修改依赖模块require内容
            contents = contents.replace(rRequire, function(m, m1) {
                var result = m,
                    depId, depOrigId, depPathResult, origPath;
                if (m1) {
                    m1 = eval(m1);
                    if (typeof m1 === 'string') {
                        if (m1 && m1.slice(0, 4) !== 'http' && origId.slice(0, 2) !== '//') {
                            depPathResult = modPathResolve(options, m1);
                            depOrigId = depPathResult.path;
                            origPath = getorigPath(depPathResult.path, base);
                            depId = fileIdMap[depPathResult.id][origPath] || depPathResult.id;
                            deps.push(depId);
                            result = result.replace(depOrigId, depId);
                        }
                    } else if (Array.isArray(m1)) {
                        for (var i = 0; i < m1.length; i++) {
                            var tmpId = m1[i];
                            if (tmpId && tmpId.slice(0, 4) !== 'http' && tmpId.slice(0, 2) !== '//') {
                                depPathResult = modPathResolve(options, m1[i]);
                                depOrigId = depPathResult.path;
                                origPath = getorigPath(depPathResult.path, base);
                                depId = fileIdMap[depPathResult.id][origPath] || depPathResult.id;
                                deps.push(depId);
                                result = result.replace(depOrigId, depId);
                            }
                        }
                    }
                }
                return result;
            });

            // 修改异步相对路径模块require.async内容
            contents = contents.replace(rRequireAsync, function(m, m1) {
                var result = m,
                    depId, depOrigId, depPathResult, origPath;
                if (m1) {
                    m1 = eval(m1);
                    if (typeof m1 === 'string') {
                        if (m1 && m1.slice(0, 4) !== 'http' && m1.slice(0, 2) !== '//') {
                            depPathResult = modPathResolve(options, m1);
                            depOrigId = depPathResult.path;
                            origPath = getorigPath(depPathResult.path, base);
                            depId = fileIdMap[depPathResult.id][origPath] || depPathResult.id;
                            result = result.replace(depOrigId, depId);
                        }
                    } else if (Array.isArray(m1)) {
                        for (var i = 0; i < m1.length; i++) {
                            var tmpId = m1[i];
                            if (tmpId && tmpId.slice(0, 4) !== 'http' && tmpId.slice(0, 2) !== '//') {
                                depPathResult = modPathResolve(options, m1[i]);
                                depOrigId = depPathResult.path;
                                origPath = getorigPath(depPathResult.path, base);
                                depId = fileIdMap[depPathResult.id][origPath] || depPathResult.id;
                                result = result.replace(depOrigId, depId);
                            }
                        }
                    }
                }
                return result;
            });

            // 为匿名模块添加模块名，同时将依赖列表添加到头部
            contents = contents.replace(rDefine, function($, $1, $2) {
                var origPath = getorigPath(filePath, base);
                var id = fileIdMap[modData.id][origPath];
                $ = $.replace($1, '');
                return deps.length ?
                    "define('" + id + "',['" + deps.join("','") + "']," :
                    "define('" + id + "',[],";
            });
        } else {
            contents = contents.replace(rSeajsUse, function($) {
                var result = $;

                if (~$.indexOf('fang.use(')) {
                    result = $.replace(rDeps, function($, _, $2) {
                        var _result = $,
                            depPathResult, depId;

                        if ($2 && $2.slice(0, 4) !== 'http' && $2.slice(0, 2) !== '//') {
                            depPathResult = modPathResolve(options, $2);
                            depId = depPathResult.id;

                            _result = "'" + depId + "'";
                        }

                        return _result;
                    });
                }

                return result;
            });
        }

        return contents;
    },

    /*
     * 合并模块内容
     * param { Object } 配置参数
     * return { String } 文件内容
     */
    comboContent = function(options) {
        var contents = '',
            fileIdMap = options.fileIdMap,
            fileMap = options.fileMap,
            newModArr = [];
        options.modArr.forEach(function(item) {
            var id = item.id,
                filePath = item.path;
            var base = options.base || path.resolve(item.path, '..');
            var origPath = getorigPath(item.path, base);
            if (!fileMap[origPath]) {
                fileMap[origPath] = true;
                newModArr.push(item);
            }
        });

        newModArr.forEach(function(item) {
            var newContents = transform(options, item);
            if (newContents) {
                contents = newContents + '\n' + contents;
            }
        });

        return new Buffer(contents);
    },

    /*
     * 解析模块的内容，如果有依赖模块则开始解析依赖模块
     * param { Object } 数据存储对象
     * param { String } 文件内容
     * param { String } 模块的绝对路径
     * param { promise }
     */
    parseContent = function(options, contents, filePath, origId, asyncMod) {
        return new Promise(function(resolve) {
            // 读取主入口路径信息
            // eg: {id: "a", path: "/Users/tankunpeng/WebSite/gulp-seajs-combo/test/src/a.js", extName: ".js"}
            var pathResult = modPathResolve(options, filePath);
            if (origId) pathResult.origId = origId;
            if (asyncMod) pathResult.asyncMod = asyncMod;
            // 读取主入口依赖模块路径信息
            // [{id: "b", extName: "", path: "/Users/tankunpeng/WebSite/gulp-seajs-combo/test/src/b", origId: "./b"},...]
            var deps = parseDeps(options, contents, pathResult);

            if (deps.length) {
                resolve(readDeps(options, deps));
            } else {
                resolve();
            }
        });
    },

    /*
     * 设置idmap
     * param { Object } 选项对象
     * param { Object } 对象数组
     * param { promise }
     */
    setIdMap = function(options, allArr) {
        var fileIdMap = options.fileIdMap;
        var fileMap = options.fileMap;
        if (allArr.length) {
            allArr.forEach(function(item) {
                var idJson = fileIdMap[item.id];
                var base = options.base || path.resolve(item.path, '..');
                var origPath = getorigPath(item.path, base);
                var nameId = item.id;
                // 设置filemap 标识是否combo
                if (fileMap[origPath]) {
                    fileMap[origPath] = false;
                }

                // 设置Idmap 标识模块id 防止id重复
                if (idJson) {
                    if (!idJson[origPath]) {
                        nameId = item.id + '' + ++options.idnum;
                        idJson[origPath] = nameId;
                    } else {
                        nameId = idJson[origPath];
                    }
                } else {
                    idJson = {};
                    idJson[origPath] = item.id;
                    fileIdMap[item.id] = idJson;
                }
                item.nameId = nameId;
            });
        }
    },
    /*
     * 解析异步模块的内容,并作为入口解析依赖
     * param { Object } 选项
     * param { function } 回调
     * param { promise }
     */
    paseAsyncContent = function(options, cb) {
        var arr = options.asyncTemMod,
            contents = '',
            num = arr.length - 1;
        arr.reverse();
        if (!options.asyncTemMod.length) {
            cb && cb(options.asyncModArr);
            return;
        }
        var preAsyncContent = function() {
            var item = arr[num];
            options.modArr = [];
            var extName = path.extname(item.path);
            if (!extName) {
                item.path += '.js';
                item.extName = '.js';
            }
            try {
                contents = fs.readFileSync(item.path, options.encoding);
                item.contents = contents;
                item.asyncMod = true;
                parseContent(options, contents, item.path, item.origId, item.asyncMod).then(function() {

                    // 记录加载id防止重复加载
                    var modArr = options.modArr;
                    var asyncTemMod = options.asyncTemMod;
                    var allArr = modArr.concat(asyncTemMod);
                    setIdMap(options, allArr);
                    var contents = comboContent(options);
                    // modArr 第0个为入口文件
                    var fileInfo = modArr.length ? modArr[0] : {};

                    if (contents.length) {
                        fileInfo.contents = contents.toString();
                        options.asyncModArr.push(fileInfo);
                    }
                    num--;
                    if (num < 0) {
                        paseAsyncContent(options, cb);
                        return;
                    }
                    preAsyncContent();

                }).catch(function(err) {
                    gutil.log(gutil.colors.red(PLUGIN_NAME + ' error: ' + err.message));
                    console.log(err.stack);
                });
            } catch (_) {
                gutil.log(gutil.colors.red(PLUGIN_NAME + ' error: File [' + item.path + '] not found.'));
            }
            arr.pop();
        };
        preAsyncContent();
    },

    // 插件入口函数
    createStream = function(options, cb) {
        if (typeof options === 'function') {
            cb = options;
        }
        var o = {
            modArr: [],
            asyncModArr: [],
            asyncTemMod: [],
            fileIdMap: {},
            fileMap: {},
            config: options.config || {},
            idnum: 0,
            contents: '',
            encoding: 'UTF-8',
            verbose: !!~process.argv.indexOf('--verbose')
        };

        if (options) {
            if (options.ignore) {
                o.ignore = options.ignore;
            }

            if (options.map) {
                o.map = options.map;
            }

            if (options.encoding) {
                o.encoding = options.encoding;
            }
            if (options.base) {
                o.base = options.base;
            }
        }

        return through.obj(function(file, enc, callback) {
            if (file.isBuffer()) {
                parseContent(o, file.contents.toString(), file.path)
                    .then(function() {
                        // 记录加载id防止重复加载
                        var modArr = o.modArr;
                        var asyncTemMod = o.asyncTemMod;
                        var allArr = modArr.concat(asyncTemMod);
                        setIdMap(o, allArr);
                        var contents = comboContent(o);

                        file.contents = contents;
                        if (o.asyncTemMod.length) {
                            paseAsyncContent(o, cb);
                        }
                        callback(null, file);
                    })
                    .catch(function(err) {
                        gutil.log(gutil.colors.red(PLUGIN_NAME + ' error: ' + err.message));
                        console.log(err.stack);
                        callback(null, file);
                    });
            } else {
                callback(null, file);
            }
        });
    };

module.exports = createStream;