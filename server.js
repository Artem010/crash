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
  user: "BpHhTy1dfD",
  password: "4QDsWBLqQz",
  database: "BpHhTy1dfD"
});

const initializePassport = require('./passport-config')
initializePassport(
  passport,
  login => users.find(user => user.login === login),
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
app.get('dino/control.css', (req, res) => {
  res.sendFile(__dirname + '/dino/control.css')
})

app.get('/', checkAuthenticated, (req, res) => {
  res.render('index.ejs', { name: req.user.name, color: req.user.color })
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
  res.render('register.ejs')
})
app.get('/dino', checkAuthenticated, (req, res) => {
  res.render('dino.ejs')
})

app.post('/register', checkNotAuthenticated, async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10)

    function random (){return Math.floor(Math.random() * (255- 0) + 0)}
    color = 'rgba('+random()+', '+random()+', '+random()+', 0.5)'
    // console.log(color);
      let sqlSELECT = "SELECT * FROM users WHERE login=? ";
      connection.query(sqlSELECT, req.body.login, (err, result) => {
        if(result == ''){
          regUserDB(req.body.login, req.body.name, hashedPassword, color);
          // console.log('Ok');
        }else console.log('error reg');
      })
      res.redirect('/login')
  } catch (err) {
    res.redirect('/register')
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
    findUserDB(req.body.login, resolve)
  })

  promise.then(
    res=>{if(res) return next()},
    error =>{console.log('error of getUserBD')}
  )


}

server.listen(3000)

let online =[]

io.on('connection', socket => {

  console.log("New coonect")


  socket.on('disconnect', () =>{
    let user = online.find(user => user.socket == socket)
    if(user){
      online.splice(online.indexOf(user),1)
      let usersOn = []
      for (let i = 0; i < online.length; i++) {
        usersOn.push(online[i].name)
      }
      io.sockets.emit('connectDisconnectOnline', {name:user.name, value:'disconnected', online:usersOn})
      console.log('onlineDisconnectLength',online.length)
    }
    console.log('user disconnected')
  })

  socket.on('newPointsRes', data =>{
    addPointsDB(data.name, data.points)

  })
  socket.on('updatedPointsRes', data =>{
    let r = []
    let sqlSELECT2 = "SELECT * FROM users ORDER BY points ";
    connection.query(sqlSELECT2, function (err, result) {
      if (err) return console.log('ОШИБККА: ',err);
      for (let i = 0; i < result.length; i++) {
        r.unshift({
          name: result[i].name,
          points: result[i].points
        })
      }
      socket.emit('setPointsRes', r);
    });
  })

  socket.on('newMessege', data =>{
    addMsgDB(data.name, data.msg)
    io.sockets.emit('Addmessage', {color:data.color, name:data.name, msg:data.msg})
  })

  socket.on('startSettings', data =>{

    online.push({
      socket:socket,
      name:data.name
    })
    let usersOn = []
    for (let i = 0; i < online.length; i++) {
      usersOn.push(online[i].name)
    }
    io.sockets.emit('connectDisconnectOnline', {name:data.name, value:'connected', online:usersOn})

    console.log('onlineConnectLength',online.length);

    let m = [];
    let sqlSELECT = "SELECT * FROM messeges ORDER BY id DESC LIMIT 15";
    connection.query(sqlSELECT, function (err, result) {
      if (err) return console.log('ОШИБККА: ',err);
      for (let i = 0; i < result.length; i++) {
        m.unshift({
          msg: result[i].messege,
          name: result[i].name,
          color: result[i].color
        })
      }

      let r = [];
      let sqlSELECT2 = "SELECT * FROM users ORDER BY points DESC";
      connection.query(sqlSELECT2, function (err, result) {
        if (err) return console.log('ОШИБККА: ',err);
        for (let i = 0; i < result.length; i++) {
          r.unshift({
            name: result[i].name,
            points: result[i].points
          })
        }
        socket.emit('PFM', {messeges:m, rating:r});
      });

    });



  });

})

function regUserDB(login, name, password, color) {

  let sqlINSERT = "INSERT INTO users(login, name, password, color) VALUES (?, ?, ?, ?)";
  connection.query(sqlINSERT, [login, name, password, color], function (err, result) {
    if (err) return console.log('ОШИБККА: ',err);
    console.log("User registered");
  });

}

function addPointsDB(name, points) {
  let sqlSELECT = "UPDATE users SET points=? WHERE name=?";
  connection.query(sqlSELECT, [points,name], function (err, result) {
    if (err) return console.log('ОШИБККА: ',err);
      console.log(result.affectedRows + " record(s) updated");
  });
}
function addMsgDB(name, msg) {
  var id ='F';
  var color ='';
  let sqlSELECT = "SELECT * FROM users WHERE name=?";
  connection.query(sqlSELECT, name, function (err, result) {
    if (err) return console.log('ОШИБККА: ',err);

    id = result[0].id;
    color = result[0].color;

    let sqlINSERT = "INSERT INTO messeges(id_name,name,messege,color) VALUES(?,?,?,?)";
    connection.query(sqlINSERT, [id,name,msg,color], function (err, result) {
      if (err) return console.log('ОШИБККА: ',err);
      console.log("Added msg by '", name, "'(", Date().toString(), ')');
    });
  });


}

function findUserDB(login, resolve) {
  let sqlSELECT = "SELECT * FROM users WHERE login=?";
  connection.query(sqlSELECT, login, (err, result) => {

    result.forEach(item => {
      users.push ({
        id: item.id,
        login: item.login,
        name: item.name,
        password:item.password,
        color: item.color
      })
      // user = {id: item.id,login: item.login}
    });
    resolve(true)
    // console.log('users=',users)
  })
}
