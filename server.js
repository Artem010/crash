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
    error =>{console.log('error of getUserDB')}
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
  if (err) return console.log('ErrorGetHistory: ',err);

  maxOnline = result[0].maxOnline

  for (let i = 0; i < result.length; i++) {
    properties.history.unshift(result[i].history)
  }

})

function addHistoryText(){
  properties.history.unshift(properties.crashScore/100)
  properties.history.splice(properties.history.length-1,1)
  addHistoryDB()
  // console.log('history='+properties.history);
}

io.on('connection', socket => {



  // console.log("New coonect")
  // console.log(properties)


  socket.on('disconnect', () =>{
    let user = online.find(user => user.socket == socket)
    if(user){
      online.splice(online.indexOf(user),1)
      let usersOn = []
      for (let i = 0; i < online.length; i++) {
        usersOn.push(online[i].username)
      }
      io.sockets.emit('connectDisconnectOnline', {username:user.username, value:'disconnected', online:usersOn})
      // console.log('onlineDisconnectLength',online.length)
      // console.log(online)
    }
    // console.log('user disconnected')
  })

  socket.on('updateBalance', data =>{
    // addPointsDB(data.username, data.balance)

    let
      maxCoefficient,
      maxWinMoney

//GET STATISTICS FOR USER
    connection.query('SELECT * FROM users WHERE username=?', data.username, (err, result) => {
      if (err) return console.log('ErrorGetHistory: ',err);

        maxCoefficient= result[0].maxCoefficient
        maxWinMoney= result[0].maxWinMoney

        if(Number(data.coefficient) > maxCoefficient){
          maxCoefficient = data.coefficient
        }
        if(Number(data.winMoney) > maxWinMoney){
          maxWinMoney=data.winMoney
        }

        let sqlSELECT = "UPDATE users SET balance=?,maxCoefficient=?,maxWinMoney=? WHERE username=?";
        connection.query(sqlSELECT, [data.balance,maxCoefficient,maxWinMoney,data.username], function (err, result) {
          if (err) return console.log('ErrorSetBalanceOfUser: ',err);
          // console.log("Balance updated!");

        });


    })


  })


  socket.on('newMessege', data =>{
    addMsgDB(data.username, data.msg)
    io.sockets.emit('Addmessage', {color:data.color, username:data.username, msg:data.msg})
  })


  socket.on('startSettings', data =>{

    online.push({
      socket:socket,
      username:data.username
    })


    if( online.length > 0 && properties.status == 'off' ){
      // setTimeout(()=>{game()}, 11000)

      properties.status = 'startNewGame'
      io.sockets.emit('startGameFromServer', properties)
      addHistoryText()
      properties.playersInform= []
      io.sockets.emit('playersInformFromServer', properties.playersInform)
      setTimeout(()=>{
          game()
      }, 11000)



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

    // console.log('onlineConnectLength',online.length);

    let m = []
    connection.query('SELECT * FROM messeges ORDER BY id DESC LIMIT 15', function (err, result) {
      if (err) return console.log('ErrorGetMessegeForStart: ',err);
      for (let i = 0; i < result.length; i++) {
        m.unshift({
          msg: result[i].messege,
          username: result[i].username,
          color: result[i].color
        })
      }

      let balance = 0
      connection.query('SELECT * FROM users WHERE username=?', data.username, function (err, result) {
        if (err) return console.log('ErrorGetBalanceForUser: ',err)
        balance =result[0].balance



        socket.emit('PFM', {m:m, history:properties.history, balance:balance});

      })


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
    // console.log('player='+player)
    // console.log('indexPlayer='+indexPlayer)

    player.coefficient = data.coefficient
    player.winMoney = data.winMoney

    properties.playersInform.splice(indexPlayer,1,player)

    // console.log('playersInform='+properties.playersInform);


    io.sockets.emit('playersInformFromServer', properties.playersInform)
  })

  socket.on('getStatistics', ()=>{
    let u = []
    connection.query('SELECT * FROM users ORDER BY balance DESC', (err, result) => {
      if (err) return console.log('ErrorGetHistory: ',err);

      for (let i = 0; i < result.length; i++) {
        if(result[i].maxCoefficient >0 ){
          let item = {
            username:result[i].username,
            balance:result[i].balance,
            maxCoefficient:result[i].maxCoefficient,
            maxWinMoney:result[i].maxWinMoney
          }
          u.push(item)
        }
      }
      // console.log(u);
      socket.emit('addStatistics', {u:u})



    })
  })

  socket.on('getBonus', data=>{
    let
      nowDate = Date.now(),
      oldDate = 0

    connection.query('SELECT * FROM users WHERE username=?', data.username, (err, result) => {
      if (err) return console.log('ErrorGetHistory: ',err);

      oldDate = Number(result[0].oldDate)

      if (((nowDate-oldDate) / (1000 * 60)).toFixed(0) >=3){
        connection.query('UPDATE users SET oldDate=? WHERE username=?', [nowDate,data.username], (err, result) => {
          if (err) return console.log('ErrorUpdateOldDate: ',err)
        })

        socket.emit('addBonus', {bonus:'add'})
      }else{
        socket.emit('addBonus', {bonus:'notNow'})
      }
      // console.log(u);



    })


  })

})


function regUserDB(username, password, color) {

  let sqlINSERT = "INSERT INTO users(username, password, color, balance, maxCoefficient, maxWinMoney, oldDate) VALUES (?, ?, ?,50, 0, 0, 0)";
  connection.query(sqlINSERT, [username, password, color], function (err, result) {
    if (err) return console.log('ErrorRegNewUser: ',err);
    console.log("User registered");
  });

}

function addMsgDB(username, msg) {
  var id ='F';
  var color ='';
  let sqlSELECT = "SELECT * FROM users WHERE username=?";
  connection.query(sqlSELECT, username, function (err, result) {
    if (err) return console.log('ErrorGetUserForAddMsg: ',err);

    id = result[0].id;
    color = result[0].color;

    let sqlINSERT = "INSERT INTO messeges(id_name,username,messege,color) VALUES(?,?,?,?)";
    connection.query(sqlINSERT, [id,username,msg,color], function (err, result) {
      if (err) return console.log('ErrorAddMsg: ',err);
      // console.log("Added msg by '", username, "'(", Date().toString(), ')');
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
  let sqlINSERT = "UPDATE settings SET maxOnline=? WHERE id=1";
  connection.query(sqlINSERT, onlineLength, (err, result) => {
    if (err) return console.log('ErrorAddMaxInline: ',err)
    // console.log("Added maxOnline")
  });


}

function game (){
  let reload = true
  function rnd(min,max){
    let rndLET =  Math.floor(Math.random() * (10- 0) + 0)
    // console.log('rndLET='+rndLET);
    if(rndLET==0){
      return 0
    }else if(rndLET==1 || rndLET==2 || rndLET==3){
      return Math.floor(Math.random() * (max- min) + min)
    }else if(rndLET==5 || rndLET==6){
      return Math.floor(Math.random() * ((max/3)- min) + min)
    }else{
      return Math.floor(Math.random() * ((max/2)- min) + min)
    }

  }

  properties.status = 'start'
  properties.crashScore = rnd(100,1000)

  io.sockets.emit('startGameFromServer', properties)
  properties.status = 'game'


  timeOnStart=1
  letTick = 75

  tick = ()=>{
    if(Number(timeOnStart.toFixed(2)) >= properties.crashScore/100){      // IF GAME ENDED


      setTimeout(()=>{
        properties.status = 'reload'
        addHistoryText()
        io.sockets.emit('startGameFromServer', properties)
        properties.playersInform= []
        io.sockets.emit('playersInformFromServer', properties.playersInform)
        setTimeout(()=>{
          if(online.length > 0){
            game()
          }else{
            properties.status = 'off'
            console.log('statusGAME=' +  properties.status);
          }
        }, 11000)

      },3000)

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
      if (err) return console.log('ErrorAddHistoryInDb: ',err)
    })
  }
  // console.log('UPDATE history')
}
