const express = require('express');
const router = express.Router();
const db = require('../database/model.js')
const mongoose = require('mongoose');
const crypto = require('crypto');
const ipfsAPI = require('ipfs-api');
const fs = require('fs');

var Device = mongoose.model('DeviceSchema', db.DeviceSchema);
var User = mongoose.model('UserSchema', db.UserSchema);
var Ipfs = mongoose.model('IpfsSchema', db.IpfsSchema);

const ipfs = ipfsAPI('ipfs.infura.io', '5001', {protocol: 'https'});

/*
 Smart contract
*/
const source = fs.readFileSync('./ether/contract.json');
var contracts = JSON.parse(source)['contracts'];
contracts = contracts['contract.sol:smartPlugPayment'];
const abi = JSON.parse(contracts['abi']);
const code = '0x' + contracts['bin'];
const mod = require('../ether/deploy');

let balance;
let smartPlug;
let accounts;
let web3;
let address;
const init = async () => {
  smartPlug = await mod.contract;
  web3 = await mod.returnweb3;
  accounts = await web3.eth.getAccounts();
};
init();

const deposit = async (index) => {
 address =  await smartPlug.methods.deposit().send({
    from: accounts[index],
    value: 1000000
  });
	await  console.log("Addr", address);
  await console.log("Deposit successful")
}

const setCurr = async (_curr) => {
  await smartPlug.methods.setCurr(_curr).call({
    from: accounts[2]
  });
}

const setPrev = async (_prev) => {
  await smartPlug.methods.setPrev(_prev).call({
    from: accounts[2]
  });
}


const payUser = async (address) => {
  await smartPlug.methods.payUser.call({
    from: accounts[0]
  });
  console.log("Users paid");
}

router.post('/register', (req, res) => {
		console.log(req.body);

		User.find({session: req.body.session}, (err, user) => {
			if(user[0]){
				user = user[0];
				Device.find({serial_number: req.body.serial_number},( err,device) => {
					if(device[0]){
						res.send({'status': false, 'err': 'already register'});
						return;
					}else{
						Device.collection.insert({user_id: user.user_id, serial_number: req.body.serial_number}, (err, device) =>{
                                     			if(!err){
                                                		console.log(device);
                                                		res.send({'status': true});
                                       			}else{
                                                		res.send({'status': false, 'err': 'device register err'});
                                        		}
                                		});
					}
				});
			}else{
				res.send({'status': false, 'err': "no user"})
			}
		});
	});
router.post('/deposit', (req, res) => {
	console.log(req.body);
		deposit(2);
                User.find({session: req.body.session}, (err, user) => {
                        if(user[0]){
                                user = user[0];
                                Device.update({serial_number: req.body.serial_number}, {$set: {sc_addr:address}}, function(err,device) {
					if(!err){
						res.send({'status': true});
					}
				});
			}
		});
});


router.post('/list', (req, res) => {
		console.log(req.body);
		User.find({session: req.body.session}, (err, user) => {
			if(user[0]){
				user = user[0];
				Device.find({user_id: user.user_id}, (err, device) =>{
					if(device[0]){
						console.log(device);
						res.send({'status': true, 'device': device});
					}else{
						res.send({'status': true, 'device': null});
					}
				});
			}
		});
});
function calcTime(offset) {

    // create Date object for current location
    d = new Date();
    
    // convert to msec
    // add local time zone offset
    // get UTC time in msec
    utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    
    // create new Date object for different city
    // using supplied offset
    nd = new Date(utc + (3600000*offset));
    
    // return time as a string
    return nd.toLocaleString();

}
String.prototype.lpad = function(padString, length) {
    var str = this;
    while (str.length < length)
        str = padString + str;
    return str;
}
var curr_usage;
var prev_usage;
router.post('/set_usage', (req, res) => {
		console.log(req.body);
		User.find({session: req.body.session}, (err, user) => {
			if(user[0]){
				user = user[0];
				now = calcTime('+5.5') // in india
				date = now.split(',')[0];
				time = now.split(',')[1];
				console.log(date)
				console.log(time);
				tmp = date.split('/');
				_date = tmp[2]+tmp[0].lpad('0', 2)+tmp[1].lpad('0', 2);
				data = req.body.data_usage;
				data = Buffer.from(data, 'utf-8');
		
				ipfs.add(data, function(err, hash) {
					if(err){
						console.log(err);
						res.send({'status':false, 'err':'ipfs add data err'});
					} else{
						hash = hash[0]['hash'];
						Ipfs.collection.insert({user_id: user.user_id, serial_number: req.body.serial_number, ipfs_hash: hash, date: _date}, (err, _ipfs) => {
							if(err){
								
								res.send({'status':false, 'err':'ipfs database err'});
							}else{
								console.log(_ipfs);
								res.send({'status':true});
								usage =((req.body.data_usage).toString().split("\"usage\"\ :")[1]);
                                                                usage = usage.split("\n")[0]
                                                                curr_usage = usage.replace(/(^\s*)|(\s*$)/gi, ""); //currunt usage
								Device.update({'serial_number': req.body.serial_number}, {$set:{'usage':curr_usage}}, function(err, result) {
console.log("test");									
console.log(result);
								});	
							}
						});
					}
					
				});
			}	
		});
});

router.post('/get_usage', (req, res) => {
                console.log(req.body);
                User.find({session: req.body.session}, (err, user) => {
                        if(user[0]){
                                user = user[0];
				Device.find({user_id: user.user_id}, (err, device) =>{
					if(err){
						res.send({'status': false, 'err':'device get err'});
					}else{
						Ipfs.find({user_id: user.user_id, date: req.body.date}, (err, _ipfs) =>{
							if(err){
								res.send({'status':false, 'err': 'ipfs get err'});
							}else{
								console.log(_ipfs[0]);
								ipfs.cat(_ipfs[0]['ipfs_hash'], function(err, result) {
									if(err){
										res.send({'status':false, 'err':'ipfs cat err'});
									}else{
										usage =(result.toString().split("\"usage\"\ :")[1]); 
										usage = usage.split("\n")[0]	
										usage = usage.replace(/(^\s*)|(\s*$)/gi, "");

										console.log(req.body.date+ ": "+usage.toString());
							
										
									}

								})
							}
						});
					}
				});

                        }
                });
});
router.get('/payUser', (req, res) => {
		var payAddr = new Array();
		var limit = 1000;
		var device;
		Device.find({}, (err, devices) =>{
			console.log(devices);
			for(var device in devices){
				console.log(device);
				console.log(device.data_usage);
				if(parseInt(device.data_usage) < limit){
					payAddr.push(device.addr);
				}
			}
			payUser(payAddr);
		});

});
router.post('/user_get_usage', (req, res) => {
                console.log(req.body);
                User.find({session: req.body.session}, (err, user) => {
                        if(user[0]){
                                user = user[0];
                                Device.find({user_id: user.user_id}, (err, device) =>{
                                        if(err){
                                                res.send({'status': false, 'err':'device get err'});
                                        }else{
                                                Ipfs.find({user_id: user.user_id, date: req.body.date}, (err, _ipfs) =>{
                                                        if(err){
                                                                res.send({'status':false, 'err': 'ipfs get err'});
                                                        }else{
                                                                console.log(_ipfs[0]);
                                                                ipfs.cat(_ipfs[0]['ipfs_hash'], function(err, result) {
                                                                        if(err){
                                                                                res.send({'status':false, 'err':'ipfs cat err'});
                                                                        }else{
                                                                                usage =(result.toString().split("\"usage\"\ :")[1]);
                                                                                usage = usage.split("\n")[0]
                                                                                usage = usage.replace(/(^\s*)|(\s*$)/gi, "");

                                                                                console.log(req.body.date+ ": "+usage.toString());
										res.send({'status': true, 'usage':usage.toString()});

                                                                        }

                                                                })
                                                        }
                                                });
                                        }
                                });

                        }
                });
});

router.post('/init_usage', (req, res) => {
                console.log(req.body);
                User.find({session: req.body.session}, (err, user) => {
                        if(user[0]){
                                user = user[0];

                        }
                });
});

module.exports = router;
