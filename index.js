/*
 * fangfis(CMD) Module combo pulgin for gulp
 * Date : 2017-08-17
 */

var fs = require('fs');
var path = require('path');
var through = require('through2');
var chalk = require('chalk');
var rDefine = /define\s*\([\s\r\n]*(['"][^'"]+['"][\s\r\n]*,)?[\s\r\n]*(\[[^\]]*\][\s\r\n]*,)?/,
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

    rRequire = /[^\.]\s*\brequire\s*\([\s\r\n]*((['"][^'"]+['"][\s\r\n]*)|(\[[^\]]*\][\s\r\n]*))/g,
    rRequireAsync = /[^\.]\s*\brequire\.async\s*\([\s\r\n]*((['"][^'"]+['"][\s\r\n]*)|(\[[^\]]*\][\s\r\n]*))/g;

const PLUGIN_NAME = 'gulp-fangfis-cmobo';

/*
 * 过滤忽略模块
 * param { Array } 忽略模块列表
 * param { String } 模块名
 * param { String } 模块标识
 * return { Boolean } 是否在忽略列表中
 */
function filterIgnore(ignore, id, origId) {
    return ignore.some(function (item) {
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
}

/*
 * 提取config中的配置，会忽略包含变量的配置，只提取纯字符串
 * param{ String } config字符串
 * return{ Object } 提取出来的配置
 */
function evalConfig(configStr) {
    var configArr = configStr,
        config = {};

    configStr = configStr.replace(/\{/, '');
    configArr = configStr.split(',');

    configArr.forEach(function (item) {
        var index, key, value;

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
}

/*
 * 解析config字符串，尝试提取alias、paths、vars
 * param{ String } 文件内容
 * return{ Object } 提取出来的配置和提取后的文件内容
 */
function parseConfig(contents) {
    var config = {};

    contents = contents.replace(rSeajsConfig, function ($) {
        $.replace(rAlias, function (_, $1) {
            config.alias = evalConfig($1);
        });

        $.replace(rPaths, function (_, $1) {
            config.paths = evalConfig($1);
        });

        $.replace(rVars, function (_, $1) {
            config.vars = evalConfig($1);
        });

        return '';
    });

    return {
        contents: contents,
        config: config
    };
}

/*
 * 基于base将依赖模块的相对路径转化成绝对路径
 * 同时对seajs.config中的paths、alias、vars，还有options.map进行处理
 * param { Object } 数据存储对象
 * param { Array } 依赖模块的相对路径列表
 * param { String } 基础路径
 * return { Array } 依赖模块的绝对路径列表
 */
function margeConfig(options, origId) {
    if (!origId) return;
    var config = options.config,
        arr, modId;
    // 处理build.json => map
    if (options.map && options.map[origId]) {
        origId = options.map[origId];
    }

    // 处理seajs.config => vars
    if (config.vars) {
        if (~origId.indexOf('{')) {
            origId = origId.replace(rVar, function ($, $1) {
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

        arr.forEach(function (_item, i) {
            if (config.paths[_item]) {
                arr[i] = config.paths[_item];
            }
        });

        arr = arr.concat(modId);
        origId = arr.join('/');
    }
    return origId;
}

/*
 * 基于base将依赖模块的相对路径转化成绝对路径
 * 同时对seajs.config中的paths、alias、vars，还有options.map进行处理
 * param { Object } 数据存储对象
 * param { Array } 依赖模块的相对路径列表
 * param { String } 基础路径
 * return { Array } 依赖模块的绝对路径列表
 */
function mergePath(options, deps, base) {
    return deps.map(function (item) {
        var origId = item.origId;

        // 防止多次merge
        if (item.path) {
            return;
        }
        origId = margeConfig(options, origId);
        return {
            id: item.id,
            extName: item.extName,
            path: origId.slice(0, 4) === 'http' || origId.slice(0, 2) === '//' ? origId : path.resolve(base, origId),
            origId: origId
        };
    });
}

/*
 * 解析模块标识
 * param { Object } 配置参数
 * param { String } 模块标识
 * return { Object } filePath: 过滤query和hash后的模块标识,id: 模块id,extName: 模块后缀
 */
function modPathResolve(options, filePath) {
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
}

/*
 * 解析基于基本路径的模块真實路徑
 * param { string } 路徑
 * param { string } 基本路徑
 */
function getorigPath(filePath, base) {
    var extName = path.extname(filePath);
    var pt = path.resolve(base, filePath);
    if (!extName) pt += '.js';
    return pt;
}

/*
 * 删除代码注释
 * param { string } 代码字符串
 */
function deleteCodeComments(code) {
    // 另一种思路更简便的办法
    // 将'://'全部替换为特殊字符，删除注释代码后再将其恢复回来
    var tmp1 = ':\/\/';
    var regTmp1 = /:\/\//g;
    var tmp2 = '@:@/@/@';
    var regTmp2 = /@:@\/@\/@/g;
    code = code.replace(regTmp1, tmp2);
    code = code.replace(rComments, '');
    return code.replace(regTmp2, tmp1);
}

/*
 * 解析依赖模块列表，如果有依赖模块则开始解析依赖模块
 * param { Object } 配置参数
 * param { Array } 依赖模块
 */
function readDeps(options, parentDeps) {
    var childDeps = [];
    parentDeps.map(function (item) {
        var id = item.id,
            extName = item.extName,
            filePath = item.path,
            origId = item.origId,
            contents, deps, isIgnore;
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
            // resolve();
            return;
        }

        // 处理普通的js模块
        if (!extName && filePath.slice(-3) !== '.js') {
            filePath += '.js';
        }

        try {
            contents = fs.readFileSync(filePath, options.encoding);
        } catch (_) {
            console.log(chalk.red(PLUGIN_NAME + ' error: File [' + filePath + '] not found.'));
            return;
        }

        deps = parseDeps(options, contents, item);
        if (deps.length) {
            for (var i = deps.length - 1; i > -1; i--) {
                var depsid = deps[i].id;
                options.modArr.forEach(function (mod) {
                    if (mod.id === depsid) {
                        deps.splice(i, 1);
                    }
                });
            }
            childDeps = childDeps.concat(deps);
        }
    });
    try {
        for (var i = childDeps.length - 1; i > -1; i--) {
            var id = childDeps[i].id;
            options.modArr.forEach(function (mod) {
                if (mod.id === id) {
                    childDeps.splice(i, 1);
                }
            });
        }
        if (childDeps.length) {
            return readDeps(options, childDeps);
        }
    } catch (err) {
        console.log(chalk.red(PLUGIN_NAME + ' error: ' + err.message));
        console.log(err.stack);
    }
}

/*
 * 提取依赖模块
 * param { Object } 配置参数
 * param { RegExp } 提取正则
 * param { Object } 文件内容
 * param { Object } 标识异步 异步作为下次处理主入口模块 需要标识id
 * return { Array } 依赖模块列表
 */
function pullDeps(options, reg, contents, modData) {
    var deps = [],
        origId, depPathResult;
    // var base = options.base || path.resolve(modData.path, '..');
    reg.lastIndex = 0;
    // 删除代码注释
    contents = deleteCodeComments(contents);
    contents.replace(reg, function (m, m1) {
        try {
            m1 = eval(m1);
        } catch (err) {
            m1 = '';
            var filePath = modData ? modData.path : '';
            var code = m;
            code = m.replace(/[\r\n]*/g, '');
            console.log(chalk.yellow(`${PLUGIN_NAME} warning:`), chalk.gray(err.message));
            console.log(chalk.yellow('                   file path:'), chalk.gray(filePath));
            console.log(chalk.yellow('                   code snippet:'), chalk.gray(code));
        }
        if (m1) {
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
}

/*
 * 从define头部提取依赖模块
 * param { Object } 配置参数
 * param { RegExp } 提取正则
 * param { Object } 文件内容
 * param { Object } 标识异步 异步作为下次处理主入口模块 需要标识id
 * return { Array } 依赖模块列表
 */
function pullDefineDeps(options, reg, contents, modData) {
    var deps = [],
        origId, depPathResult;
    // var base = options.base || path.resolve(modData.path, '..');
    reg.lastIndex = 0;
    // 删除代码注释
    contents = deleteCodeComments(contents);
    contents.replace(reg, function (m, m1, m2) {
        if (m2) {
            var m2len = m2.length;
            if (m2.charAt(m2len - 1) === ',') m2 = m2.slice(0, m2len - 1);
        }
        try {
            m2 = eval(m2);
        } catch (err) {
            m2 = '';
            var filePath = modData ? modData.path : '';
            var code = m;
            code = m.replace(/[\r\n]*/g, '');
            console.log(chalk.yellow(`${PLUGIN_NAME} warning:`), chalk.gray(err.message));
            console.log(chalk.yellow('                   file path:'), chalk.gray(filePath));
            console.log(chalk.yellow('                   code snippet:'), chalk.gray(code));
        }
        if (m2) {
            if (Array.isArray(m2)) {
                for (var i = 0; i < m2.length; i++) {
                    origId = m2[i];
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
}

/*
 * 解析依赖模块
 * param { Object } 配置参数
 * param { String } 文件内容
 * param { Object } 模块数据
 * return { Array } 依赖模块数据列表
 */
function parseDeps(options, contents, modData) {
    var isSeajsUse = !!~contents.indexOf('fang.use('),
        id = modData.id,
        deps = [],
        defineDeps = [],
        asyncDeps = [],
        configResult, name, base, matches;

    // 标准模块
    if (!isSeajsUse) {
        defineDeps = pullDefineDeps(options, rDefine, contents, modData);
        deps = pullDeps(options, rRequire, contents, modData);
        asyncDeps = pullDeps(options, rRequireAsync, contents, modData);
    }
    // 解析seajs.use
    else {
        configResult = parseConfig(contents);
        contents = configResult.contents;

        for (name in configResult.config) {
            options.config[name] = configResult.config[name];
        }

        matches = contents.match(rSeajsUse);

        matches.forEach(function (item) {
            var _deps = [];

            if (~item.indexOf('fang.use')) {
                _deps = pullDeps(options, rDeps, item);
                deps = deps.concat(_deps);
            }
        });
    }
    // 合并依赖数组
    for (var i = 0, len = defineDeps.length; i < len; i++) {
        var theDeps = defineDeps[i];
        var hasvalue = false;
        for (var j = 0, lenj = deps.length; j < lenj; j++) {
            if (theDeps.origId === deps[j].origId) {
                hasvalue = true;
                break;
            }
        }
        if (!hasvalue) {
            deps.unshift(theDeps);
        }
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
}

/*
 * 转换模块内容
 * param { Object } 配置参数
 * param { Object } 模块数据
 * param { Object } 文件在需要合并的数组中下标
 * return { String } 文件内容
 */
function transform(options, modData, index) {
    var contents = modData.contents,
        isSeajsUse = !!~contents.indexOf('fang.use('),
        origId = margeConfig(options, modData.origId),
        filePath = modData.path,
        fileIdMap = options.fileIdMap,
        fileMainIdMap = options.fileMainIdMap,
        fileSyncIdMap = options.fileSyncIdMap,
        deps = [];
    var base = options.base || path.resolve(modData.path, '..');
    var matchMod;
    // contents = deleteCodeComments(contents);
    // 标准模块
    if (!isSeajsUse) {
        // 修改依赖模块require内容
        matchMod = contents.match(rDefine);
        // 写过依赖的不再分析函数体依赖关系
        if (contents) {
            contents = contents.replace(rRequire, function (m, m1) {
                var result = m,
                    depId, depOrigId, depPathResult, origPath, mainId;
                try {
                    m1 = eval(m1);
                } catch (err) {
                    m1 = '';
                }
                if (m1) {
                    if (typeof m1 === 'string') {
                        m1 = margeConfig(options, m1);
                        if (m1 && m1.slice(0, 4) !== 'http' && origId.slice(0, 2) !== '//') {
                            depPathResult = modPathResolve(options, m1);
                            depOrigId = depPathResult.path;
                            origPath = getorigPath(depPathResult.path, base);
                            depId = fileIdMap[depPathResult.id] && fileIdMap[depPathResult.id][origPath] ? fileIdMap[depPathResult.id][origPath] : depPathResult.id;
                            mainId = fileMainIdMap[origPath];
                            if (mainId && !fileSyncIdMap[origPath]) depId = mainId;
                            if (deps.indexOf(depId) === -1) deps.push(depId);
                            result = result.replace(depOrigId, depId);
                        }
                    } else if (Array.isArray(m1)) {
                        for (var i = 0; i < m1.length; i++) {
                            var tmpId = m1[i];
                            tmpId = margeConfig(options, tmpId);
                            if (tmpId && tmpId.slice(0, 4) !== 'http' && tmpId.slice(0, 2) !== '//') {
                                depPathResult = modPathResolve(options, m1[i]);
                                depOrigId = depPathResult.path;
                                origPath = getorigPath(depPathResult.path, base);
                                depId = fileIdMap[depPathResult.id] && fileIdMap[depPathResult.id][origPath] ? fileIdMap[depPathResult.id][origPath] : depPathResult.id;
                                mainId = fileMainIdMap[origPath];
                                if (mainId && !fileSyncIdMap[origPath]) depId = mainId;
                                if (deps.indexOf(depId) === -1) deps.push(depId);
                                result = result.replace(depOrigId, depId);
                            }
                        }
                    }
                }
                return result;
            });
        }
        if (contents) {
            // 修改异步相对路径模块require.async内容
            contents = contents.replace(rRequireAsync, function (m, m1) {
                var result = m,
                    depId, depOrigId, depPathResult, origPath, mainId;
                try {
                    m1 = eval(m1);
                } catch (err) {
                    m1 = '';
                }
                if (m1) {
                    if (typeof m1 === 'string') {
                        m1 = margeConfig(options, m1);
                        if (m1 && m1.slice(0, 4) !== 'http' && m1.slice(0, 2) !== '//') {
                            depPathResult = modPathResolve(options, m1);
                            depOrigId = depPathResult.path;
                            origPath = getorigPath(depPathResult.path, base);
                            depId = fileIdMap[depPathResult.id] && fileIdMap[depPathResult.id][origPath] ? fileIdMap[depPathResult.id][origPath] : depPathResult.id;
                            mainId = fileMainIdMap[origPath];
                            if (mainId && !fileSyncIdMap[origPath]) depId = mainId;
                            result = result.replace(depOrigId, depId);
                        }
                    } else if (Array.isArray(m1)) {
                        for (var i = 0; i < m1.length; i++) {
                            var tmpId = m1[i];
                            tmpId = margeConfig(options, tmpId);
                            if (tmpId && tmpId.slice(0, 4) !== 'http' && tmpId.slice(0, 2) !== '//') {
                                depPathResult = modPathResolve(options, m1[i]);
                                depOrigId = depPathResult.path;
                                origPath = getorigPath(depPathResult.path, base);
                                depId = fileIdMap[depPathResult.id] && fileIdMap[depPathResult.id][origPath] ? fileIdMap[depPathResult.id][origPath] : depPathResult.id;
                                mainId = fileMainIdMap[origPath];
                                if (mainId && !fileSyncIdMap[origPath]) depId = mainId;
                                result = result.replace(depOrigId, depId);
                            }
                        }
                    }
                }
                return result;
            });

            // 为非模块代码添加define标识
            if (!matchMod) {
                var origPath = getorigPath(filePath, base);
                var id = fileIdMap[modData.id][origPath];
                contents += `define('${id}',[],function () {});\n`;
            } else {
                // 为匿名模块添加模块名，同时将依赖列表添加到头部
                contents = contents.replace(rDefine, function ($, $1, $2) {
                    var origPath = getorigPath(filePath, base);
                    var id = fileIdMap[modData.id][origPath];
                    if (index === 0) id = modData.origId;
                    var modArr = null;
                    var modId = [];
                    var result = '';
                    if ($2) {
                        var $2len = $2.length;
                        if ($2.charAt($2len - 1) === ',') $2 = $2.slice(0, $2len - 1);
                        try {
                            modArr = eval($2);
                        } catch (err) {
                            console.log(err);
                        }
                    }
                    if (modArr && modArr.length) {
                        for (var i = 0; i < modArr.length; i++) {
                            var tmpId = modArr[i];
                            tmpId = margeConfig(options, tmpId);
                            if (tmpId && tmpId.slice(0, 4) !== 'http' && tmpId.slice(0, 2) !== '//') {
                                var depPathResult = modPathResolve(options, tmpId);
                                origPath = getorigPath(depPathResult.path, base);
                                var depId = fileIdMap[depPathResult.id] && fileIdMap[depPathResult.id][origPath] ? fileIdMap[depPathResult.id][origPath] : depPathResult.id;
                                var mainId = fileMainIdMap[origPath];
                                if (mainId && !fileSyncIdMap[origPath]) depId = mainId;
                                if (modId.indexOf(depId) === -1) modId.push(depId);
                            }
                        }
                    }
                    // 根据依赖关系返回替换字符串
                    if ($2) {
                        if (modId.length) {
                            result = `define('${id}',['${modId.join('\',\'')}'],`;
                        } else {
                            result = `define('${id}',[],`;
                        }
                    } else if (deps.length) {
                        result = `define('${id}',['${deps.join('\',\'')}'],`;
                    } else {
                        result = `define('${id}',[],`;
                    }
                    return result;
                });
            }
        }
    } else {
        contents = contents.replace(rSeajsUse, function ($) {
            var result = $;
            if (~$.indexOf('fang.use(')) {
                result = $.replace(rDeps, function ($, _, $2) {
                    var tmpResult = $,
                        depPathResult, depId;
                    if ($2 && $2.slice(0, 4) !== 'http' && $2.slice(0, 2) !== '//') {
                        depPathResult = modPathResolve(options, $2);
                        depId = depPathResult.id;
                        tmpResult = `'${depId}'`;
                    }
                    return tmpResult;
                });
            }
            return result;
        });
    }
    return contents;
}

/*
 * 合并模块内容
 * param { Object } 配置参数
 * return { String } 文件内容
 */
function comboContent(options) {
    var contents = '',
        fileMap = options.fileMap,
        newModArr = [];
    options.modArr.forEach(function (item) {
        var base = options.base || path.resolve(item.path, '..');
        var origPath = getorigPath(item.path, base);
        if (!fileMap[origPath]) {
            fileMap[origPath] = true;
            newModArr.push(item);
        }
    });

    if (newModArr.length > 0) console.log(chalk.cyan(PLUGIN_NAME + ': '), 'Module ' + chalk.yellow(newModArr[0].origId + ' starting combo'));
    newModArr.forEach(function (item, index) {
        var newContents = transform(options, item, index);
        if (newContents) {
            var pathStr = path.extname(item.path) ? item.path : item.path + '.js';
            console.log(chalk.green('                     ✔ Module ' + pathStr));
            contents = newContents + '\n' + contents;
        }
    });

    return new Buffer(contents);
}

/*
 * 解析模块基于基本路径的真实id
 * param { Object } 选项
 * param { String } 模块的绝对路径
 */
function getorigIdbyBase(options, filePath, asyncFlag) {
    var fileSyncIdMap = options.fileSyncIdMap,
        fileMainIdMap = options.fileMainIdMap;
    var extName = path.extname(filePath);
    filePath = path.resolve(filePath);
    var base = path.resolve(options.base) || path.resolve(filePath, '..');
    var diffPath = filePath.replace(base, '');
    var origId = '';
    if (diffPath.charAt(0) === '/') {
        var arr = diffPath.split('');
        arr.shift();
        diffPath = arr.join('');
    }
    origId = diffPath.replace(extName, '');
    // 同步
    if (!asyncFlag) {
        if (!fileMainIdMap[filePath]) {
            fileSyncIdMap[filePath] = origId;
        }
    } else if (!fileSyncIdMap[filePath]) {
        fileMainIdMap[filePath] = origId;
    }
    return origId;
}

/*
 * 解析模块的内容，如果有依赖模块则开始解析依赖模块
 * param { Object } 数据存储对象
 * param { String } 文件内容
 * param { String } 模块的绝对路径
 */
function parseContent(options, contents, filePath, asyncMod, callback) {
    // 读取主入口路径信息
    // eg: {id: "a", path: "/Users/tankunpeng/WebSite/gulp-seajs-combo/test/src/a.js", extName: ".js"}
    var pathResult = modPathResolve(options, filePath);
    // 设置入口模块基于base的真实id
    pathResult.origId = getorigIdbyBase(options, filePath, true);
    if (asyncMod) pathResult.asyncMod = asyncMod;
    // 读取主入口依赖模块路径信息
    // [{id: "b", extName: "", path: "/Users/tankunpeng/WebSite/gulp-seajs-combo/test/src/b", origId: "./b"},...]
    var deps = parseDeps(options, contents, pathResult);
    if (deps.length) {
        readDeps(options, deps);
        callback && callback();
    } else {
        callback && callback();
    }
}

/*
 * 设置idmap
 * param { Object } 选项对象
 * param { Object } 对象数组
 */
function setIdMap(options, allArr) {
    var fileIdMap = options.fileIdMap;
    if (allArr.length) {
        allArr.forEach(function (item) {
            var idJson = fileIdMap[item.id];
            var base = options.base || path.resolve(item.path, '..');
            var origPath = getorigPath(item.path, base);
            var nameId = item.id;

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
}

/*
 * 解析异步模块的内容,并作为入口解析依赖
 * param { Object } 选项
 * param { function } 回调
 */
function paseAsyncContent(options, cb) {
    var arr = options.asyncTemMod,
        contents = '';
    arr.reverse();
    // 依赖过的模块不在异步加载
    for (var i = arr.length - 1; i > -1; i--) {
        for (var j = 0, len = options.modArr.length; j < len; j++) {
            if (options.modArr[j].origId === arr[i].origId) {
                arr.splice(i, 1);
                break;
            }
        }
    }
    if (!options.asyncTemMod.length) {
        cb && cb(options.asyncModArr);
        return;
    }

    var num = arr.length - 1;
    var preAsyncContent = function () {
        var item = arr[num];
        options.modArr = [];
        var extName = path.extname(item.path);
        if (!extName) {
            item.path += '.js';
            item.extName = '.js';
        }
        if (item.origId.slice(0, 4) === 'http' || item.origId.slice(0, 2) === '//') {
            arr.pop();
            item.asyncMod = true;
            num--;
            if (num < 0) {
                paseAsyncContent(options, cb);
                return;
            }

            preAsyncContent();
        } else {
            arr.pop();
            try {
                contents = fs.readFileSync(item.path, options.encoding);
                item.contents = contents;
                item.asyncMod = true;
                parseContent(options, contents, item.path, item.asyncMod, function () {
                    // 记录加载id防止重复加载
                    var modArr = options.modArr;
                    var asyncTemMod = options.asyncTemMod;
                    modArr.forEach(function (ite) {
                        var base = options.base || path.resolve(ite.path, '..');
                        var origPath = getorigPath(ite.path, base);
                        getorigIdbyBase(options, origPath);
                    });
                    asyncTemMod.forEach(function (ite) {
                        var base = options.base || path.resolve(ite.path, '..');
                        var origPath = getorigPath(ite.path, base);
                        getorigIdbyBase(options, origPath, true);
                    });
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
                });
            } catch (err) {
                console.log(chalk.red(PLUGIN_NAME + ' error: ' + err.message + '.'));
            }
        }
    };
    preAsyncContent();
}

// 插件入口函数
function createStream(options, cb) {
    if (typeof options === 'function') {
        cb = options;
    }
    return through.obj(function (file, enc, callback) {
        var o = {
            modArr: [],
            asyncModArr: [],
            asyncTemMod: [],
            fileIdMap: {},
            // 标识异步模块基于base路径的真实id
            fileMainIdMap: {},
            // 标识同步依赖模块基于base路径的真实id
            fileSyncIdMap: {},
            // 标识文件是否已被combo
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
        if (file.isBuffer()) {
            parseContent(o, file.contents.toString(), file.path, false, function () {
                // 记录加载id防止重复加载
                var modArr = o.modArr;
                var asyncTemMod = o.asyncTemMod;
                // 分析同步模块id 防止已同步的模块被异步模块id替换
                modArr.forEach(function (ite) {
                    var base = o.base || path.resolve(ite.path, '..');
                    var origPath = getorigPath(ite.path, base);
                    getorigIdbyBase(o, origPath);
                });
                // 分析异步模块id 优先同步模块id调用,没有同步则修改成异步模块调用和声明
                asyncTemMod.forEach(function (ite) {
                    var base = o.base || path.resolve(ite.path, '..');
                    var origPath = getorigPath(ite.path, base);
                    getorigIdbyBase(o, origPath, true);
                });
                var allArr = modArr.concat(asyncTemMod);
                setIdMap(o, allArr);
                var contents = comboContent(o);

                file.contents = contents;
                if (o.asyncTemMod.length) {
                    paseAsyncContent(o, cb);
                }
                callback(null, file);
            });
        } else {
            callback(null, file);
        }
    });
}

module.exports = createStream;