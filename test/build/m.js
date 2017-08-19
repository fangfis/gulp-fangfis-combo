seajs.config({

 
  alias: {
    'i' : 'alias/i'
  },

 
  paths: {
    'foo': 'foo/bar/biz'
  },

 
  vars: {
    'locale': 'zh-cn'
  },

 
  map: [
    ['http://example.com/js/app/', 'http://localhost/js/app/']
  ],

 
  preload: [
    Function.prototype.bind ? '' : 'es5-safe',
    this.JSON ? '' : 'json'
  ],

 
  debug: true,

 
  base: 'src',

 
  charset: 'utf-8'
});

var hello = 'hello';

seajs.use( ['{locale}/n', 'i', 'o'], function(){
    var args = Array.prototype.join.call( arguments, ', ' );
    console.log( args + ' is done' );
});

