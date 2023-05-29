const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");
const { query } = require("express");

const app = express();
const port = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());
require("dotenv").config();
//pass:
//user:

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.z1jayhr.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

//veryfy jwt
function verifyJWT(req, res, next) {
  console.log("token inside verify jwt", req.headers.authorization);
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unauthorised access");
  }
  const token = authHeader.split(" ")[1]; //taking without bearer
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status;
    }

    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    const appointmentOptionCollection = client
      .db("doctorsPortal")
      .collection("appointmentOptions");
    const bookingCollections = client
      .db("doctorsPortal")
      .collection("bookings");
    const userCollections = client.db("doctorsPortal").collection("user");

    //Use aggregate to query multiple collection and then merge data
    // module 74.5-6
    app.get("/appointmentOptions", async (req, res) => {
      //date is our current date
      const date = req.query.date;
      console.log(date);
      const query = {};
      const options = await appointmentOptionCollection.find(query).toArray();

      //get the bookings (booked) of the provided date
      const bookingQuery = { appointmentDate: date };
      const alreadyBooked = await bookingCollections
        .find(bookingQuery)
        .toArray();

      console.log(alreadyBooked, "alreadyBooked");

      //code carefully
      options.forEach((option) => {
        const optionBooked = alreadyBooked.filter(
          (book) => book.treatment === option.name
        );

        console.log(optionBooked, "optionBooked");

        const bookedSlots = optionBooked.map((book) => book.slot);
        // console.log(date, option.name, bookedSlots);
        const remainingSlots = option.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        //now set options slots to remaining slots
        option.slots = remainingSlots;
        // console.log(date, option.name, remainingSlots.length);
      });

      res.send(options);
    });

    // API versioning,  mongodb aggregation

    app.get("/v2/appointmentOptions", async (req, res) => {
      const date = req.query.date;
      const options = await appointmentOptionCollection
        .aggregate([
          {
            $lookup: {
              from: "bookings",
              localField: "name",
              foreignField: "treatment",
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ["$appointmentDate", date],
                    },
                  },
                },
              ],
              as: "booked",
            },
          },
          {
            $project: {
              name: 1,
              slots: 1,
              booked: {
                $map: {
                  input: "$booked",
                  as: "book",
                  in: "$$book.slot",
                },
              },
            },
          },
          {
            $project: {
              name: 1,
              slots: {
                $setDifference: ["$slots", "$booked"],
              },
            },
          },
        ])
        .toArray();
        
      res.send(options);
    });

    /**
     * API naming convention
     * bookings
     * app.get('/bookings')
     * app.get('/bookings/:id')
     * app.post('/bookings')
     * app.patch('/bookings/:id')
     * app.delete('/bookings/:id')
     *
     */

    //to get my bookings (with email)
    app.get("/bookings", verifyJWT, async (req, res) => {
      const email = req.query.email; // when fetch will add ?email=email, but api is '/bookings'
      const decodedEmail = req.decoded.email;
      // console.log('token', req.headers.authorization)
      if (email != decodedEmail) {
        return res.status(403).send({ message: "fobiden access" });
      }

      const query = { email: email };

      const bookings = await bookingCollections.find(query).toArray();
      res.send(bookings);
    });

    //to post booking
    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      console.log(booking);
      //to limit one user to take one appointment
      const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.email,
        treatment: booking.treatment,
      };
      const alreadyBooked = await bookingCollections.find(query).toArray();
      if (alreadyBooked.length) {
        const message = `You already have a booking on ${booking.appointmentDate}`;
        return res.send({ acknowledged: false, message });
      }

      const result = await bookingCollections.insertOne(booking);
      res.send(result);
      // console.log(result);
    });

    //Jwt create and sending to client from here

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await userCollections.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "1h",
        });
        return res.send({ accessToken: token });
      }
      console.log(user);
      res.status(403).send({ accessToken: "" });
    });

    //user saving in db
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await userCollections.insertOne(user);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.log());

app.get("/", (req, res) => {
  res.send("docors server runing");
});

app.listen(port, () => {
  console.log("server running on port", port);
});
