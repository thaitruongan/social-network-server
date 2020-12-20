const functions = require('firebase-functions');

const app = require('express')();

const FBAuth = require('./util/fbAuth');

const {getAllFeeds,postOneFeed,getFeed,commentOnFeed,likeFeed,unlikeFeed,deleteFeed} = require('./handlers/feeds');
const {signup, login,uploadImage,addUserDetails,getAuthenticatedUser
    ,getUserDetails,markNotificationsRead,resetPassword,getAllUsers} = require('./handlers/users');

const {db} = require('./util/admin');

//Feed Route 
app.get('/feeds', getAllFeeds);
app.post('/feed',FBAuth, postOneFeed);
app.get('/feed/:feedId',getFeed);
app.delete('/feed/:feedId',FBAuth,deleteFeed);
app.get('/feed/:feedId/like',FBAuth,likeFeed);
app.get('/feed/:feedId/unlike',FBAuth,unlikeFeed);
app.post('/feed/:feedId/comment',FBAuth,commentOnFeed);

//
//Users Route
app.post('/signup',signup);
app.post('/login',login);
app.post('/user/image',FBAuth, uploadImage);
app.post('/user',FBAuth,addUserDetails);
app.get('/user',FBAuth,getAuthenticatedUser);
app.get('/user/:handle', getUserDetails);
app.post('/notifications',FBAuth,markNotificationsRead);
app.post('/resetpassword',resetPassword);
app.get('/getAllUsers',getAllUsers);



exports.api = functions.region('asia-southeast2').https.onRequest(app);

exports.createNotificationOnLike = functions.region('asia-southeast2').firestore.document('likes/{id}')
    .onCreate((snapshot)=>{
        return db.doc(`/feeds/${snapshot.data().feedId}`).get()
        .then((doc) =>{
            if(doc.exists && doc.data().userHandle !== snapshot.data().userHandle){
                return db.doc(`/notifications/${snapshot.id}`).set({
                    createdAt: new Date().toISOString(),
                    recipient: doc.data().userHandle,
                    sender: snapshot.data().userHandle,
                    type: 'like',
                    read: false,
                    feedId: doc.id       
                });
            }
        })
        .catch(err=>{
            console.error(err); 
        });
    });

exports.deleteNotificationOnUnLike = functions.region('asia-southeast2').firestore.document('likes/{id}')
    .onDelete((snapshot)=>{
        return db.doc(`/notifications/${snapshot.id}`)
        .delete()
        .catch(err=>{
            console.error(err);
            return;
        })
    })

exports.createNotificationOnComment = functions.region('asia-southeast2').firestore.document('comments/{id}')
    .onCreate((snapshot)=>{
        return db.doc(`/feeds/${snapshot.data().feedId}`).get()
        .then(doc=>{
            if(doc.exists && doc.data().userHandle !== snapshot.data().userHandle){
                return db.doc(`/notifications/${snapshot.id}`).set({
                    createdAt: new Date().toISOString(),
                    recipient: doc.data().userHandle,
                    sender: snapshot.data().userHandle,
                    type: 'comment',
                    read: false,
                    feedId: doc.id       
                });
            }
        })
        .catch(err=>{
            console.error(err);
            return; 
        });
    })

exports.onUserImageChange = functions.region('asia-southeast2').firestore.document('/users/{userId}')
    .onUpdate((change)=>{
        console.log(change.before.data());
        console.log(change.after.data());
        if(change.before.data().imageUrl !== change.after.data().imageUrl){
            console.log('image has change');
            let batch = db.batch();
        return db.collection('feeds').where('userHandle','==',change.before.data().handle).get()
            .then((data)=>{
                data.forEach(doc=>{
                    const feed = db.doc(`/feeds/${doc.id}`);
                    batch.update(feed,{userImage:change.after.data().imageUrl})
                });
                return batch.commit();
            });
        }else return true;
    });

exports.onFeedDeleted = functions.region('asia-southeast2').firestore.document('/feeds/{feedId}')
    .onDelete((snapshot,context)=>{
        const feedId = context.params.feedId;
        const batch = db.batch();
        return db.collection('comments').where('feedId','==',feedId).get()
            .then(data=>{
                data.forEach(doc=>{
                    batch.delete(db.doc(`/comments/${doc.id}`));
                })
                return db.collection('likes').where('feedId','==',feedId).get();
            })
            .then(data=>{
                data.forEach(doc=>{
                    batch.delete(db.doc(`/likes/${doc.id}`));
                })
                return db.collection('notifications').where('feedId','==',feedId).get();
            })
            .then(data=>{
                data.forEach(doc=>{
                    batch.delete(db.doc(`/notifications/${doc.id}`));
                })
                return batch.commit();
            })
            .catch(err=>console.error(err));

    })