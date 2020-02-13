if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const express = require('express')
const app = express()
const bcrypt = require('bcrypt')
const passport = require('passport')
const flash = require('express-flash')
const session = require('express-session')
const methodOverride = require('method-override')

const server = require('http').Server(app)
const io = require('socket.io')(server);

const mysql = require('mysql2');
const connection = mysql.createPool({
  host: "remotemysql.com",
  user: "B5hw25qJZT",
  password: "sByKftco5L",
  database: "B5hw25qJZT"
});

const initializePassport = require('./passport-config')
initializePassport(
  passport,
  username => users.find(user => user.username === username),
  id => users.find(user => user.id === id)
)

const users = []

app.set('view-engine', 'ejs')
app.use(express.urlencoded({ extended: false }))
app.use(flash())
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}))
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))
app.use(express.static('public'))

app.get('/main.css', (req, res) => {
  res.sendFile(__dirname + '/main.css')
})

app.get('/', checkAuthenticated, (req, res) => {
  res.render('index.ejs', { username: req.user.username, color: req.user.color })
})

app.get('/login', checkNotAuthenticated, (req, res) => {
  // findUserDB()
  res.render('login.ejs')
})

app.post('/login', getUser, checkNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login',
  failureFlash: true
}))

app.get('/register', checkNotAuthenticated, (req, res) => {
  res.render('register.ejs', {message:''})
})

app.post('/register', checkNotAuthenticated, async (req, res) => {
  if(req.body.password == req.body.passwordDouble){

    try {
      const hashedPassword = await bcrypt.hash(req.body.password, 10)

      function random (){return Math.floor(Math.random() * (255- 0) + 0)}
      color = 'rgba('+random()+', '+random()+', '+random()+', 0.5)'
      // console.log(color);
      let sqlSELECT = "SELECT * FROM users WHERE username=? ";
      connection.query(sqlSELECT, req.body.username, (err, result) => {
        if(result == ''){
          regUserDB(req.body.username, hashedPassword, color);
          // console.log('Ok');
        }else console.log('error reg');
      })
      res.redirect('/login')
    } catch (err) {
      res.redirect('/register')
    }

  }else{
    res.render('register.ejs',{message: 'Пароли не совпадают!'})
  }

})

app.get('/logout', (req, res) => {
  req.logOut()
  res.redirect('/login')
})

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next()
  }

  res.redirect('/login')
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect('/')
  }
  next()
}

function getUser(req, res, next) {

  let promise = new Promise((resolve, reject) => {
    findUserDB(req.body.username, resolve)
  })

  promise.then(
    res=>{if(res) return next()},
    error =>{console.log('error of getUserBD')}
  )


}

server.listen(3000)

let
  online = [],
  maxOnline,
  properties = {
    status:'off',
    crashScore:0,
    history:[],
    playersInform:[]
  }


connection.query('SELECT * FROM settings LIMIT 6', (err, result) => {
  if (err) return console.log('ОШИБККА: ',err);

  maxOnline = result[0].maxOnline

  for (let i = 0; i < result.length; i++) {
    properties.history.unshift(result[i].history)
  }

})

function addHistoryText(){
  properties.history.unshift(properties.crashScore/100)
  properties.history.splice(properties.history.length-1,1)
  addHistoryDB()
  console.log('history='+properties.history);
}

io.on('connection', socket => {



  console.log("New coonect")
  console.log(properties)


  socket.on('disconnect', () =>{
    let user = online.find(user => user.socket == socket)
    if(user){
      online.splice(online.indexOf(user),1)
      let usersOn = []
      for (let i = 0; i < online.length; i++) {
        usersOn.push(online[i].username)
      }
      io.sockets.emit('connectDisconnectOnline', {username:user.username, value:'disconnected', online:usersOn})
      console.log('onlineDisconnectLength',online.length)
    }
    console.log('user disconnected')
  })

  socket.on('newPointsRes', data =>{
    // addPointsDB(data.username, data.balance)

    let sqlSELECT = "UPDATE users SET balance=? WHERE username=?";
    connection.query(sqlSELECT, [data.balance,data.username], function (err, result) {
      if (err) return console.log('ОШИБККА: ',err);
        console.log(result.affectedRows + " record(s) updated");


        let r = []
        let sqlSELECT2 = "SELECT * FROM users ORDER BY balance ";
        connection.query(sqlSELECT2, function (err, result) {
          if (err) return console.log('ОШИБККА: ',err);
          for (let i = 0; i < result.length; i++) {
            if(result[i].balance > 0){
              r.unshift({
                username: result[i].username,
                balance: result[i].balance
              })
            }
          }
          io.sockets.emit('setPointsRes', r);
        });



    });





  })

  socket.on('updatedPointsRes', data =>{
    let r = []
    let sqlSELECT2 = "SELECT * FROM users ORDER BY balance ";
    connection.query(sqlSELECT2, function (err, result) {
      if (err) return console.log('ОШИБККА: ',err);
      for (let i = 0; i < result.length; i++) {
        if(result[i].balance > 0){
          r.unshift({
            username: result[i].username,
            balance: result[i].balance
          })
        }
      }
      io.sockets.emit('setPointsRes', r);
    });
  })

  socket.on('newMessege', data =>{
    addMsgDB(data.username, data.msg)
    io.sockets.emit('Addmessage', {color:data.color, username:data.username, msg:data.msg})
  })

  socket.on('newMessegePoints', data =>{
    if(data.val){
      io.sockets.emit('Addmessage', {username:data.username, msg:data.msg, val:data.val})
    }
  })

  socket.on('startSettings', data =>{

    online.push({
      socket:socket,
      username:data.username
    })


    if( online.length > 0 && properties.status == 'off' ){
      game()
    }else{
      socket.emit('startGameFromServer', properties)
    }


    if(online.length > maxOnline){
      addMaxOnlineDB(online.length)
    }
    let usersOn = []
    for (let i = 0; i < online.length; i++) {
      usersOn.push(online[i].username)
    }
    io.sockets.emit('connectDisconnectOnline', {username:data.username, value:'connected', online:usersOn})

    console.log('onlineConnectLength',online.length);

    let m = []
    connection.query('SELECT * FROM messeges ORDER BY id DESC LIMIT 15', function (err, result) {
      if (err) return console.log('ОШИБККА: ',err);
      for (let i = 0; i < result.length; i++) {
        m.unshift({
          msg: result[i].messege,
          username: result[i].username,
          color: result[i].color
        })
      }

      socket.emit('PFM', {m:m,history:properties.history});
    })



  });

  socket.on('playerJoined', data=>{

    let player ={
      name:data.name,
      rate:data.rate,
      coefficient:'',
      winMoney:''
    }
    properties.playersInform.push(player)
    io.sockets.emit('playersInformFromServer', properties.playersInform)
  })

  socket.on('playerLeaves', data=>{

    // .name,winMoney,coefficient
    let player = properties.playersInform.find(line => line.name == data.name)
    let indexPlayer = properties.playersInform.indexOf(player)
    console.log('player='+player)
    console.log('indexPlayer='+indexPlayer)

    player.coefficient = data.coefficient
    player.winMoney = data.winMoney

    properties.playersInform.splice(indexPlayer,1,player)

    console.log('playersInform='+properties.playersInform);


    io.sockets.emit('playersInformFromServer', properties.playersInform)
  })

})


function regUserDB(username, password, color) {

  let sqlINSERT = "INSERT INTO users(username, password, color, balance) VALUES (?, ?, ?,0)";
  connection.query(sqlINSERT, [username, password, color], function (err, result) {
    if (err) return console.log('ОШИБККА: ',err);
    console.log("User registered");
  });

}

function addPointsDB(username, balance) {
  // let sqlSELECT = "UPDATE users SET balance=? WHERE name=?";
  // connection.query(sqlSELECT, [balance,name], function (err, result) {
  //   if (err) return console.log('ОШИБККА: ',err);
  //     console.log(result.affectedRows + " record(s) updated");
  // });
}

function addMsgDB(username, msg) {
  var id ='F';
  var color ='';
  let sqlSELECT = "SELECT * FROM users WHERE username=?";
  connection.query(sqlSELECT, username, function (err, result) {
    if (err) return console.log('ОШИБККА: ',err);

    id = result[0].id;
    color = result[0].color;

    let sqlINSERT = "INSERT INTO messeges(id_name,username,messege,color) VALUES(?,?,?,?)";
    connection.query(sqlINSERT, [id,username,msg,color], function (err, result) {
      if (err) return console.log('ОШИБККА: ',err);
      console.log("Added msg by '", username, "'(", Date().toString(), ')');
    });
  });


}

function findUserDB(username, resolve) {
  let sqlSELECT = "SELECT * FROM users WHERE username=?";
  connection.query(sqlSELECT, username, (err, result) => {

    result.forEach(item => {
      users.push ({
        id: item.id,
        username: item.username,
        password:item.password,
        color: item.color
      })
      // user = {id: item.id,login: item.login}
    });
    resolve(true)
    // console.log('users=',users)
  })
}

function addMaxOnlineDB(onlineLength) {

  // let sqlINSERT = "INSERT INTO settings(maxOnline) VALUES(?)";
  let sqlINSERT = "UPDATE settings SET maxOnline=?";
  connection.query(sqlINSERT, onlineLength, (err, result) => {
    if (err) return console.log('ОШИБККА: ',err)
    console.log("Added maxOnline")
  });


}

function game (){
  function rnd(min,max){return Math.floor(Math.random() * (max- min) + min)}
  properties.status = 'start'
  properties.crashScore = rnd(200,800)
  io.sockets.emit('startGameFromServer', properties)
  properties.status = 'game'


  timeOnStart=1
  letTick = 75

  tick = ()=>{
    if(Number(timeOnStart.toFixed(2)) >= properties.crashScore/100){      // IF GAME ENDED

      setTimeout(()=>{
        properties.status = 'reload'
        io.sockets.emit('startGameFromServer', properties)
        addHistoryText()
        properties.playersInform= []
        io.sockets.emit('playersInformFromServer', properties.playersInform)
        setTimeout(()=>{
          if(online.length > 0){
            game()
          }else{
            properties.status = 'off'
            console.log('statusGAME=' +  properties.status);
          }
        }, 13000)

      },2000)
    }else{                                                                 // IF GAME NOW
      letTick = letTick-0.1
      timeOnStart += 0.01
      setTimeout(tick,letTick);
    }
  }

  setTimeout(tick,letTick)

}

function addHistoryDB() {
  for (var i = 0; i < 6; i++) {
    sqlSELECT = "UPDATE settings SET history=? WHERE id=?"
    connection.query(sqlSELECT, [properties.history[i], (i+1)], function (err, result) {
      if (err) return console.log('ОШИБККА: ',err)
    })
  }
  console.log('UPDATE history')
}
