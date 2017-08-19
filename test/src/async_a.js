define(function( require, exports, module ){
    var b = require.async('./async_b');
    module.exports = 'a' + ' ' + b;
});