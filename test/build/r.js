define('s1',[],function(){
    return 's';
});

define('s',[],function(){
    return 's2';
});

define('r',['s1','s'],function( require ){
    var s = require( 's1' ),
        s2 = require( 's' );

    return s + ', ' + s2 + ' is done';
});

