// ExcelJS only needs hashing and random salt for sheet protection. Bundle the
// existing standard implementations, excluding unused signing and EC code.
exports.createHash=require('create-hash');
exports.randomBytes=require('randombytes');
exports.getHashes=()=>['sha1','sha224','sha256','sha384','sha512','md5','rmd160'];
