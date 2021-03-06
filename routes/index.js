var express = require('express');
var router = express.Router();
var twilio = require('../twilioToFly');

var api_key = 'baad4775-71b7-41ef-ad89-090c48e3956e';
var appname = 'sofia';
var usersFlyRef = require('flybase').init(appname, 'user', api_key);
var usersNameLookup = require('flybase').init(appname, 'user', api_key);
var messagesFlyRef = require('flybase').init(appname, 'messages', api_key);
var conversationsFlyRef = require('flybase').init(appname, 'conversations', api_key);

var user_id = '566740b102b50doc1377109252';

// get home page
router.get('/', function(req, res) {
	res.render('index', { title: 'Home'});
});


router.get('/dashboard', function(req, res) {
	var data = {
			new: {
				tasks: [],
				num: 0
			},
			open: {
				tasks: [],
				num: 0
			},
			closed: {
				tasks: [],
				num: 0
			}
	};

	getTasks({'worker_id': user_id}, function(tasks, userinfo) {
		for (i=0; i < tasks.length; i++) {
			if (tasks[i].messages.length == 1) {
				tasks[i].status = 'new';
				data.new.tasks.push(tasks[i]);
			} else if (tasks[i].status == 'open') {
				data.open.tasks.push(tasks[i]);
			} else {
				data.closed.tasks.push(tasks[i]);
			}
		}
		data.new.num = data.new.tasks.length;
		data.closed.num = data.closed.tasks.length;
		data.open.num = data.open.tasks.length;
		res.render('dashboard', {
			title: 'Dashboard',
			data: data,
			user_id: user_id,
			user_picture: userinfo[user_id].picture,
			user_name: userinfo[user_id].name
		});
	});
});

router.post('/message', function(req, res){
	twilio.receiveUserMessage(req, res);
});

router.post('/reply', function(req, res){
	twilio.replyToUser(req, res);
});

router.get('/account', function(req, res) {
	// get list of seniors they talk to
	// get tasks they are participating on
	// send to account template
	var data = {
			info: {
				name: '',
				picture: '',
				num_open: 0,
				num_closed: 0,
				rating: '',
				phone_number: '',
				personal_info: '',
				linked_seniors: []
			},
			tasks: []
		},
		seniors_seen = [];
	getTasks({'worker_id': user_id}, function(tasks, userinfo) {
		data.info.name = userinfo[user_id].name;
		data.info.picture = userinfo[user_id].picture;
		data.info.rating = userinfo[user_id].rating;
		data.info.phone_number = userinfo[user_id].phone_number;
		data.info.personal_info = userinfo[user_id].profile_info;
		data.info.location = userinfo[user_id].location;
		data.tasks = tasks;
		for (i=0; i < tasks.length; i++) {
			if (tasks[i].status == 'open') {
				data.info.num_open += 1;
			} else {
				data.info.num_closed += 1;
			}
			if (seniors_seen.indexOf(tasks[i].senior_id) == -1) {
				data.info.linked_seniors.push({name: userinfo[tasks[i].senior_id].name, id: tasks[i].senior_id});
				seniors_seen.push(tasks[i].senior_id);
			}
		}
		res.render('account', { 
			title: 'Account', 
			data: data,
			user_id: user_id
		});
	});
});

router.get('/lookup', function(req, res) {
	res.render('lookup', { title: 'Lookup'});
});

router.post('/lookup', function(req, res) {
	usersNameLookup.where({name: req.body.search}).on('value', function(snapshot) {
		// no result
		if (snapshot.raw.length == 0) {
			res.render('lookup', {title: 'Lookup'});
		// just pick first result
		} else {
			if (snapshot.raw[0].type == 'senior') {
				res.redirect('/lookup/' + snapshot.raw[0]._id);
			} else {
				res.redirect('/account');
			}
		}
	});
});

router.get('/lookup/:account_id', function(req, res) {
	// get account profile
	var data = {
		info: {
			name: '',
			picture: '',
			phone_number: '',
			personal_info: '',
			linked_workers: []
		},
		tasks: []
	};
	getTasks({'senior_id': req.params.account_id}, function(tasks, userinfo) {
		data.info.name = userinfo[req.params.account_id].name;
		data.info.picture = userinfo[req.params.account_id].picture;
		data.info.phone_number = userinfo[req.params.account_id].phone_number;
		data.info.personal_info = userinfo[req.params.account_id].profile_info;
		data.info.location = userinfo[req.params.account_id].location;
		data.tasks = tasks;
		res.render('lookup_dashboard', { 
			title: 'Lookup', 
			data: data,
			user_id: user_id
		});
	});
});

router.get('/signout', function(req, res) {
	// sign user out before redirect
	res.redirect('/');
});

module.exports = router;

var getTasks = function(params, callback){
	var tasks = [],
		task_ids = [],
		senior_ids = [],
		task = {},
		message = {},
		userinfo = {},
		date;
	// this nesting is horrible
	usersFlyRef.on('value', function(snapshot) {
		for (i=0; i<snapshot.raw.length; i++) {
			userinfo[snapshot.raw[i]._id] = {
				email: snapshot.raw[i].email,
				name: snapshot.raw[i].name,
				phone_number: snapshot.raw[i].phone_number,
				profile_info: snapshot.raw[i].profile_info,
				location: snapshot.raw[i].location,
				picture: snapshot.raw[i].picture,
				rating: snapshot.raw[i].rating
			}
		}
		conversationsFlyRef.where(params).on('value', function(snapshot) {
			for (i=0; i<snapshot.raw.length; i++) {
				task_ids.push(snapshot.raw[i]._id);
				task = {
					id: snapshot.raw[i]._id,
					worker_id: snapshot.raw[i].worker_id,
					senior_id: snapshot.raw[i].senior_id,
					title: snapshot.raw[i].title,
					summary: '',
					status: snapshot.raw[i].status,
					messages: []
				};
				tasks.push(task);
			}
			messagesFlyRef.where({'conversation_id': {'$in': task_ids } }).on('value', function(snapshot) {
				// this is also terrible
				for (i=0; i<tasks.length; i++) {
					for (j=0; j<snapshot.raw.length; j++) {
						if (tasks[i].id == snapshot.raw[j].conversation_id) {
							date = new Date(snapshot.raw[j].time);
							datestring = (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear() + ' ';

							if (date.getHours() > 11) {
								datestring = datestring + (date.getHours() - 12) + ':';
								ampm = 'PM';
							} else {
								datestring = datestring + date.getHours() + ':';
								ampm = 'AM';
							}
					
							if (date.getMinutes() < 10) {
								datestring = datestring + '0' + date.getMinutes() + ' ' + ampm;
							} else {
								datestring = datestring + date.getMinutes() + ' ' + ampm;
							}
							message = {
								message: snapshot.raw[j].body,
								sender_name: userinfo[snapshot.raw[j].sender_id].name,
								sender_id: snapshot.raw[j].sender_id,
								sender_picture: userinfo[snapshot.raw[j].sender_id].picture,
								time: datestring
							};
							tasks[i].summary = snapshot.raw[j].body;
							tasks[i].messages.push(message);
						}
					}
				}
				callback(tasks, userinfo);
			});
		});
	});
}