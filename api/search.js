// ReviewWise AI backend: GET /api/search?q=<product name or link>
// For now this returns one fictional sample analysis for every search.
// Later, this is where we fetch real reviews (Reddit, Amazon, Google, brand sites)
// and ask an AI model to analyse them. The page only needs the same JSON shape back.

const SAMPLE = {
  "sample": true,
  "product": {
    "kicker": "KESTRELVUE / OLED TV",
    "brand": "Kestrelvue",
    "name": "Aria KA-65",
    "description": "65-inch 4K OLED TV, fictional sample",
    "short": "Kestrelvue · 65-inch 4K OLED TV",
    "url": "https://example.com/sample/kestrelvue-aria-65",
    "urlLabel": "Official Kestrelvue product listing"
  },
  "summary": {
    "headline": "Good picture quality. Software and connectivity are the main risks.",
    "stats": [
      {
        "value": "33",
        "label": "reviews analyzed"
      },
      {
        "value": "3 sources",
        "label": "SampleMart 13 · DemoShop 13 · ShopLane 7"
      },
      {
        "value": "Mar 4 – Oct 18, 2026",
        "label": "review dates"
      }
    ],
    "note": "37 reviews collected. Removed 3 suspicious reviews and 1 off-topic review."
  },
  "likes": [
    {
      "id": "picture",
      "title": "Picture quality",
      "count": 15,
      "of": 17,
      "tone": "positive",
      "later": false,
      "text": "Reviewers praise deep blacks, rich colour, HDR and wide viewing angles.",
      "when": null,
      "notes": [
        {
          "label": "Good to know",
          "text": "It looks its best in a darker room. The 2 complaints are about sunlight washing it out and faint banding (R3, R13)."
        }
      ],
      "quotes": [
        {
          "text": "Blacks are truly black and HDR movies look incredible in a dark room.",
          "ref": "R1, SampleMart"
        },
        {
          "text": "Colours and contrast are excellent.",
          "ref": "R2, DemoShop"
        }
      ],
      "panel": "picture"
    },
    {
      "id": "gaming",
      "title": "Gaming and refresh rate",
      "count": 6,
      "of": 6,
      "tone": "positive",
      "later": false,
      "text": "Smooth 144Hz with VRR and low input lag on PS5 and Xbox.",
      "when": null,
      "notes": [
        {
          "label": "Good to know",
          "text": "Only two HDMI ports support full 144Hz, so plug consoles into those (R16)."
        }
      ],
      "quotes": [
        {
          "text": "Gaming on PS5 is fantastic.",
          "ref": "R4, SampleMart"
        },
        {
          "text": "The game mode is superb.",
          "ref": "R27, ShopLane"
        }
      ],
      "panel": "gaming"
    },
    {
      "id": "remote",
      "title": "Remote control",
      "count": 3,
      "of": 4,
      "tone": "positive",
      "later": false,
      "text": "Simple to use, responds instantly and charges from room light.",
      "when": null,
      "notes": [
        {
          "label": "Good to know",
          "text": "Turning off HDMI-CEC to stop soundbar dropouts means the remote can no longer control volume (R18)."
        }
      ],
      "quotes": [
        {
          "text": "The remote is comfortable and responds instantly.",
          "ref": "R36, SampleMart"
        },
        {
          "text": "Picture is gorgeous and the remote charges from room light, which is a nice touch.",
          "ref": "R8, DemoShop"
        }
      ],
      "panel": "remote"
    },
    {
      "id": "value",
      "title": "Value for money",
      "count": 1,
      "of": 2,
      "tone": "positive",
      "later": false,
      "text": "Seen as good value on sale. One reviewer felt the launch price was high.",
      "when": null,
      "notes": [
        {
          "label": "Good to know",
          "text": "Both reviewers bought it on sale (R22, R30)."
        }
      ],
      "quotes": [
        {
          "text": "Great value for a 65-inch OLED on sale.",
          "ref": "R30, SampleMart"
        },
        {
          "text": "Worth it at the sale price.",
          "ref": "R22, SampleMart"
        }
      ],
      "panel": "value"
    },
    {
      "id": "setup",
      "title": "Setup and ease of use",
      "count": 1,
      "of": 1,
      "tone": "positive",
      "later": false,
      "text": "Setup took about ten minutes, with a simple remote.",
      "when": null,
      "notes": [],
      "quotes": [
        {
          "text": "Setup took ten minutes and the remote is simple to use.",
          "ref": "R25, SampleMart"
        }
      ],
      "panel": "usability"
    }
  ],
  "concerns": [
    {
      "id": "smart",
      "title": "Ads and software updates",
      "count": 6,
      "of": 8,
      "tone": "negative",
      "later": false,
      "text": "Sponsored rows on the home screen (2 reviews) and problems that started after firmware updates (4 reviews).",
      "when": null,
      "notes": [
        {
          "label": "What reviewers did",
          "text": "No reviewer found a way to turn the ads off. One says the September update fixed their update-related problem (R32)."
        },
        {
          "label": "How to avoid it",
          "text": "Install the latest firmware when you set it up."
        }
      ],
      "quotes": [
        {
          "text": "The home screen is full of ads and sponsored rows, which is annoying on a TV this expensive.",
          "ref": "R5, DemoShop"
        },
        {
          "text": "The home screen ads are intrusive and the menus feel slow.",
          "ref": "R29, DemoShop"
        }
      ],
      "panel": "smart"
    },
    {
      "id": "earc",
      "title": "Soundbar dropouts over eARC",
      "count": 4,
      "of": 5,
      "tone": "negative",
      "later": true,
      "text": "Soundbar audio cuts out every few minutes or several times an evening.",
      "when": "After the June 2026 update.",
      "notes": [
        {
          "label": "What reviewers did",
          "text": "The September update fixed it for one reviewer (R32). Turning off HDMI-CEC stops the dropouts, but the TV remote then can’t control volume (R18). A factory reset didn’t help (R19)."
        },
        {
          "label": "How to avoid it",
          "text": "Update the TV before connecting a soundbar."
        }
      ],
      "quotes": [
        {
          "text": "After the latest update the eARC audio cuts out randomly every few minutes.",
          "ref": "R19, ShopLane"
        },
        {
          "text": "The eARC audio still drops out with my soundbar even after the August update.",
          "ref": "R31, ShopLane"
        }
      ],
      "panel": "hdmi"
    },
    {
      "id": "sound",
      "title": "Built-in sound",
      "count": 4,
      "of": 4,
      "tone": "negative",
      "later": false,
      "text": "Thin speakers, weak bass and dialogue that’s hard to hear.",
      "when": null,
      "notes": [
        {
          "label": "What reviewers did",
          "text": "3 of the 4 reviewers mention a soundbar, and one says it fixed the problem (R35)."
        },
        {
          "label": "How to avoid it",
          "text": "Plan for a soundbar if clear dialogue matters to you."
        }
      ],
      "quotes": [
        {
          "text": "Great picture, but the built-in sound is weak and has no real bass.",
          "ref": "R17, SampleMart"
        },
        {
          "text": "The built-in speakers sound thin though, and dialogue is hard to hear without a soundbar.",
          "ref": "R2, DemoShop"
        }
      ],
      "panel": "sound"
    },
    {
      "id": "glare",
      "title": "Glare in bright rooms",
      "count": 3,
      "of": 5,
      "tone": "negative",
      "later": false,
      "text": "The picture looks washed out and reflective when sunlight or lamps hit the screen.",
      "when": null,
      "notes": [
        {
          "label": "What reviewers did",
          "text": "One owner keeps the blinds half closed during the day and is happy with it (R28)."
        },
        {
          "label": "How to avoid it",
          "text": "Avoid placing it opposite a window. Owners who control daylight are happier."
        }
      ],
      "quotes": [
        {
          "text": "With sunlight coming through the windows the picture looks washed out and the glare is distracting.",
          "ref": "R3, ShopLane"
        },
        {
          "text": "It is advertised as glare free, but in my bright room you still see reflections of lamps at night.",
          "ref": "R24, DemoShop"
        }
      ],
      "panel": "brightness"
    },
    {
      "id": "retention",
      "title": "Channel-logo image retention",
      "count": 2,
      "of": 4,
      "tone": "negative",
      "later": true,
      "text": "A faint news or sports channel logo stays visible on grey screens.",
      "when": "After about 8 months.",
      "notes": [
        {
          "label": "What reviewers did",
          "text": "Running pixel refresh helped a little (R15)."
        },
        {
          "label": "How to avoid it",
          "text": "Vary what’s on screen. Two heavy gamers report no burn-in after 5 to 7 months (R23, R34)."
        }
      ],
      "quotes": [
        {
          "text": "After eight months of daily use, mostly news and sports, I can see a faint retention of the channel logo on grey screens.",
          "ref": "R33, SampleMart"
        },
        {
          "text": "After about eight months I can see a faint image retention of the news channel logo in the corner.",
          "ref": "R15, SampleMart"
        }
      ],
      "panel": "d_burnin",
      "panelGroup": 1
    },
    {
      "id": "panel",
      "title": "Dead pixels and banding",
      "count": 2,
      "of": 2,
      "tone": "negative",
      "later": false,
      "text": "One TV arrived with dead pixels; another shows faint banding in dark scenes.",
      "when": null,
      "notes": [
        {
          "label": "What reviewers did",
          "text": "One reviewer returned the TV for a refund (R7)."
        },
        {
          "label": "How to avoid it",
          "text": "Check the screen on plain grey and black images while you can still return it."
        }
      ],
      "quotes": [
        {
          "text": "Arrived with a cluster of dead pixels in the centre of the screen.",
          "ref": "R7, ShopLane"
        },
        {
          "text": "I noticed faint banding in dark grey scenes, especially in fades to black.",
          "ref": "R13, DemoShop"
        }
      ],
      "panel": "panel"
    },
    {
      "id": "motion",
      "title": "Motion and upscaling",
      "count": 1,
      "of": 1,
      "tone": "negative",
      "later": false,
      "text": "Cable broadcasts look soft and fast football stutters a little.",
      "when": null,
      "notes": [
        {
          "label": "How to avoid it",
          "text": "The same reviewer finds 4K streaming excellent, so low-quality cable is the weak spot (R9)."
        }
      ],
      "quotes": [
        {
          "text": "Excellent with 4K streaming, but cable broadcasts look soft and fast motion in football matches stutters a little.",
          "ref": "R9, SampleMart"
        }
      ],
      "panel": "motion"
    }
  ],
  "concernsShown": 5,
  "disagreements": [
    {
      "theme": "Burn-in",
      "count": "4 reviews discuss it",
      "panel": "d_burnin",
      "a": {
        "title": "No burn-in so far",
        "text": "Both mainly gaming, after 5 to 7 months of use.",
        "meta": "2 reviews · avg. rating 5.0"
      },
      "b": {
        "title": "Logo retention appeared",
        "text": "Both mostly news and sports, after about 8 months.",
        "meta": "2 reviews · avg. rating 3.0"
      },
      "explanation": "What people watch matters: static channel logos are behind both retention reports."
    },
    {
      "theme": "Brightness in bright rooms",
      "count": "5 reviews discuss it",
      "panel": "d_brightness",
      "a": {
        "title": "Bright enough",
        "text": "One uses blinds, one credits the anti-glare screen.",
        "meta": "2 reviews · avg. rating 4.0"
      },
      "b": {
        "title": "Too dim or reflective",
        "text": "All three are in sunny or brightly lit rooms.",
        "meta": "3 reviews · avg. rating 3.0"
      },
      "explanation": "Room light decides it: owners who can control daylight are happier."
    },
    {
      "theme": "Smart platform",
      "count": "8 reviews discuss it",
      "panel": "d_smart",
      "a": {
        "title": "Works well",
        "text": "Voice control and a fix in the September update.",
        "meta": "2 reviews · avg. rating 4.5"
      },
      "b": {
        "title": "Frustrating",
        "text": "2 about home-screen ads, 4 about problems after updates.",
        "meta": "6 reviews · avg. rating 2.7"
      },
      "explanation": "They’re judging different parts: the menus and voice work, the ads and updates don’t."
    }
  ],
  "warranty": {
    "note": "Sample 5-year terms for the fictional Kestrelvue brand",
    "covered": [
      "Panel, power and board failures for 5 years",
      "Dead or stuck pixels reported within 30 days",
      "Repair or replacement, with return shipping paid",
      "Software faults, fixed through firmware updates"
    ],
    "notCoveredTitle": "Not covered: problems caused by use or setup",
    "notCovered": [
      {
        "text": "Image retention from long periods of static content, such as channel logos.",
        "count": "2 reviewers",
        "after": "report this."
      },
      {
        "text": "Glare and reflections from room lighting.",
        "count": "3 reviewers",
        "after": "complain about this."
      },
      {
        "text": "Damage from drops, pressure or improper wall mounting.",
        "count": "No reviewers",
        "after": "report this."
      }
    ]
  },
  "competitors": [
    {
      "brand": "LG",
      "name": "OLED evo C6",
      "model": "65-inch, model OLED65C6PUA",
      "tags": [
        "2026",
        "OLED",
        "Up to 165Hz VRR"
      ],
      "url": "https://www.lg.com/us/tvs/lg-oled65c6pua-oled-4k-tv",
      "site": "lg.com"
    },
    {
      "brand": "SAMSUNG",
      "name": "S90H OLED",
      "model": "65-inch, model QN65S90HAEXZA",
      "tags": [
        "2026",
        "OLED",
        "Glare Free"
      ],
      "url": "https://www.samsung.com/us/",
      "site": "samsung.com"
    },
    {
      "brand": "SONY",
      "name": "BRAVIA 8 II",
      "model": "65-inch, model K-65XR80M2",
      "tags": [
        "2025",
        "QD-OLED",
        "Google TV"
      ],
      "url": "https://electronics.sony.com/",
      "site": "sony.com"
    }
  ],
  "competitorsNote": "Real TVs. Their reviews haven’t been analyzed here, so no ratings or claims are shown for them.",
  "reviews": [
    {
      "id": "R1",
      "site": "SampleMart",
      "date": "2026-03-04",
      "rating": 5,
      "verified": true,
      "url": "https://example.com/samplemart/aria65/r1",
      "sentiment": "positive",
      "text": "The picture is stunning. Blacks are truly black and HDR movies look incredible in a dark room. Best TV I have owned.",
      "contexts": [
        "Dark rooms and evenings",
        "Movies and streaming"
      ],
      "hl": {
        "picture": [
          "The picture is stunning.",
          "Blacks are truly black and HDR movies look incredible in a dark room."
        ]
      }
    },
    {
      "id": "R2",
      "site": "DemoShop",
      "date": "2026-03-09",
      "rating": 4,
      "verified": true,
      "url": null,
      "sentiment": "mixed",
      "text": "Colours and contrast are excellent. The built-in speakers sound thin though, and dialogue is hard to hear without a soundbar.",
      "contexts": [],
      "hl": {
        "picture": [
          "Colours and contrast are excellent."
        ],
        "sound": [
          "The built-in speakers sound thin though, and dialogue is hard to hear without a soundbar."
        ]
      }
    },
    {
      "id": "R3",
      "site": "ShopLane",
      "date": "2026-03-15",
      "rating": 2,
      "verified": true,
      "url": "https://example.com/shoplane/aria65/r3",
      "sentiment": "negative",
      "text": "Too dim for my living room. With sunlight coming through the windows the picture looks washed out and the glare is distracting. Fine at night, but I bought it for daytime sports.",
      "contexts": [
        "Bright rooms",
        "Dark rooms and evenings",
        "Sports and live TV"
      ],
      "hl": {
        "brightness": [
          "Too dim for my living room.",
          "With sunlight coming through the windows the picture looks washed out and the glare is distracting.",
          "Fine at night, but I bought it for daytime sports."
        ],
        "picture": [
          "With sunlight coming through the windows the picture looks washed out and the glare is distracting."
        ]
      }
    },
    {
      "id": "R4",
      "site": "SampleMart",
      "date": "2026-03-20",
      "rating": 5,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "Gaming on PS5 is fantastic. 144Hz with VRR is smooth and input lag is very low in game mode.",
      "contexts": [
        "Gaming"
      ],
      "hl": {
        "gaming": [
          "Gaming on PS5 is fantastic.",
          "144Hz with VRR is smooth and input lag is very low in game mode."
        ]
      }
    },
    {
      "id": "R5",
      "site": "DemoShop",
      "date": "2026-03-26",
      "rating": 4,
      "verified": true,
      "url": null,
      "sentiment": "mixed",
      "text": "Great picture quality. The home screen is full of ads and sponsored rows, which is annoying on a TV this expensive.",
      "contexts": [],
      "hl": {
        "picture": [
          "Great picture quality."
        ],
        "smart": [
          "The home screen is full of ads and sponsored rows, which is annoying on a TV this expensive."
        ]
      }
    },
    {
      "id": "R6",
      "site": "SampleMart",
      "date": "2026-04-02",
      "rating": 5,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "Amazing TV, love it!",
      "contexts": [],
      "hl": {}
    },
    {
      "id": "R7",
      "site": "ShopLane",
      "date": "2026-04-06",
      "rating": 1,
      "verified": true,
      "url": "https://example.com/shoplane/aria65/r7",
      "sentiment": "negative",
      "text": "Arrived with a cluster of dead pixels in the centre of the screen. I returned it for a refund and the pickup took two weeks to arrange.",
      "contexts": [],
      "hl": {
        "panel": [
          "Arrived with a cluster of dead pixels in the centre of the screen."
        ],
        "warranty": [
          "I returned it for a refund and the pickup took two weeks to arrange."
        ]
      }
    },
    {
      "id": "R8",
      "site": "DemoShop",
      "date": "2026-04-11",
      "rating": 4,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "Picture is gorgeous and the remote charges from room light, which is a nice touch. The stand feet are very wide, so it barely fits on my console.",
      "contexts": [],
      "hl": {
        "picture": [
          "Picture is gorgeous and the remote charges from room light, which is a nice touch."
        ],
        "remote": [
          "Picture is gorgeous and the remote charges from room light, which is a nice touch."
        ],
        "stand": [
          "The stand feet are very wide, so it barely fits on my console."
        ]
      }
    },
    {
      "id": "R9",
      "site": "SampleMart",
      "date": "2026-04-18",
      "rating": 3,
      "verified": true,
      "url": null,
      "sentiment": "mixed",
      "text": "Excellent with 4K streaming, but cable broadcasts look soft and fast motion in football matches stutters a little. Upscaling of low quality channels is average.",
      "contexts": [
        "Movies and streaming",
        "Sports and live TV"
      ],
      "hl": {
        "motion": [
          "Excellent with 4K streaming, but cable broadcasts look soft and fast motion in football matches stutters a little.",
          "Upscaling of low quality channels is average."
        ]
      }
    },
    {
      "id": "R13",
      "site": "DemoShop",
      "date": "2026-05-08",
      "rating": 4,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "Contrast is superb for movies. I noticed faint banding in dark grey scenes, especially in fades to black. Not a dealbreaker but visible.",
      "contexts": [
        "Movies and streaming"
      ],
      "hl": {
        "picture": [
          "Contrast is superb for movies.",
          "I noticed faint banding in dark grey scenes, especially in fades to black."
        ],
        "panel": [
          "I noticed faint banding in dark grey scenes, especially in fades to black."
        ]
      }
    },
    {
      "id": "R15",
      "site": "SampleMart",
      "date": "2026-10-10",
      "rating": 2,
      "verified": true,
      "url": "https://example.com/samplemart/aria65/r15",
      "sentiment": "negative",
      "text": "After about eight months I can see a faint image retention of the news channel logo in the corner. Running the pixel refresh helped a little but it is still visible on grey backgrounds.",
      "contexts": [
        "Sports and live TV"
      ],
      "hl": {
        "burnin": [
          "After about eight months I can see a faint image retention of the news channel logo in the corner."
        ]
      }
    },
    {
      "id": "R16",
      "site": "DemoShop",
      "date": "2026-05-29",
      "rating": 4,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "Picture and gaming performance are both great. I wish it had a fourth HDMI port that supports full 144Hz, since only two do.",
      "contexts": [
        "Gaming"
      ],
      "hl": {
        "picture": [
          "Picture and gaming performance are both great."
        ],
        "gaming": [
          "Picture and gaming performance are both great.",
          "I wish it had a fourth HDMI port that supports full 144Hz, since only two do."
        ],
        "hdmi": [
          "I wish it had a fourth HDMI port that supports full 144Hz, since only two do."
        ]
      }
    },
    {
      "id": "R17",
      "site": "SampleMart",
      "date": "2026-06-06",
      "rating": 3,
      "verified": true,
      "url": null,
      "sentiment": "mixed",
      "text": "Great picture, but the built-in sound is weak and has no real bass. Ended up buying a soundbar.",
      "contexts": [],
      "hl": {
        "picture": [
          "Great picture, but the built-in sound is weak and has no real bass."
        ],
        "sound": [
          "Great picture, but the built-in sound is weak and has no real bass."
        ]
      }
    },
    {
      "id": "R18",
      "site": "DemoShop",
      "date": "2026-06-15",
      "rating": 2,
      "verified": true,
      "url": "https://example.com/demoshop/aria65/r18",
      "sentiment": "negative",
      "text": "Since the June firmware update my soundbar keeps dropping out over eARC several times an evening. Turning off HDMI-CEC stops it, but then the TV remote no longer controls the volume.",
      "contexts": [
        "Dark rooms and evenings"
      ],
      "hl": {
        "hdmi": [
          "Since the June firmware update my soundbar keeps dropping out over eARC several times an evening.",
          "Turning off HDMI-CEC stops it, but then the TV remote no longer controls the volume."
        ],
        "smart": [
          "Since the June firmware update my soundbar keeps dropping out over eARC several times an evening."
        ],
        "remote": [
          "Turning off HDMI-CEC stops it, but then the TV remote no longer controls the volume."
        ]
      }
    },
    {
      "id": "R19",
      "site": "ShopLane",
      "date": "2026-06-24",
      "rating": 2,
      "verified": true,
      "url": null,
      "sentiment": "negative",
      "text": "After the latest update the eARC audio cuts out randomly every few minutes. Customer support told me to factory reset, which did not help.",
      "contexts": [],
      "hl": {
        "hdmi": [
          "After the latest update the eARC audio cuts out randomly every few minutes."
        ],
        "smart": [
          "After the latest update the eARC audio cuts out randomly every few minutes."
        ],
        "reliability": [
          "After the latest update the eARC audio cuts out randomly every few minutes."
        ],
        "service": [
          "Customer support told me to factory reset, which did not help."
        ]
      }
    },
    {
      "id": "R20",
      "site": "SampleMart",
      "date": "2026-07-02",
      "rating": 4,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "It is bright enough for my sunny room and the anti-glare screen works well during the day. Colours are rich and accurate.",
      "contexts": [
        "Bright rooms"
      ],
      "hl": {
        "brightness": [
          "It is bright enough for my sunny room and the anti-glare screen works well during the day."
        ],
        "picture": [
          "Colours are rich and accurate."
        ]
      }
    },
    {
      "id": "R21",
      "site": "DemoShop",
      "date": "2026-07-12",
      "rating": 3,
      "verified": true,
      "url": null,
      "sentiment": "mixed",
      "text": "The picture is lovely but the eARC connection to my soundbar drops out daily since the update. Support says a fix is coming but gave no date.",
      "contexts": [],
      "hl": {
        "picture": [
          "The picture is lovely but the eARC connection to my soundbar drops out daily since the update."
        ],
        "hdmi": [
          "The picture is lovely but the eARC connection to my soundbar drops out daily since the update."
        ],
        "smart": [
          "The picture is lovely but the eARC connection to my soundbar drops out daily since the update."
        ],
        "service": [
          "Support says a fix is coming but gave no date."
        ]
      }
    },
    {
      "id": "R22",
      "site": "SampleMart",
      "date": "2026-07-20",
      "rating": 4,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "Worth it at the sale price. At full launch price I would have felt it was overpriced compared with similar OLEDs. The five-year warranty helped me decide.",
      "contexts": [],
      "hl": {
        "value": [
          "Worth it at the sale price.",
          "At full launch price I would have felt it was overpriced compared with similar OLEDs."
        ],
        "warranty": [
          "The five-year warranty helped me decide."
        ]
      }
    },
    {
      "id": "R23",
      "site": "ShopLane",
      "date": "2026-08-03",
      "rating": 5,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "Excellent picture and the stand is solid. It has been five months with no burn-in at all, even with a lot of gaming.",
      "contexts": [
        "Gaming"
      ],
      "hl": {
        "picture": [
          "Excellent picture and the stand is solid."
        ],
        "stand": [
          "Excellent picture and the stand is solid."
        ],
        "burnin": [
          "It has been five months with no burn-in at all, even with a lot of gaming."
        ],
        "gaming": [
          "It has been five months with no burn-in at all, even with a lot of gaming."
        ]
      }
    },
    {
      "id": "R24",
      "site": "DemoShop",
      "date": "2026-08-19",
      "rating": 4,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "Stunning image. It is advertised as glare free, but in my bright room you still see reflections of lamps at night. Far better than my old TV though.",
      "contexts": [
        "Bright rooms",
        "Dark rooms and evenings"
      ],
      "hl": {
        "brightness": [
          "It is advertised as glare free, but in my bright room you still see reflections of lamps at night."
        ]
      }
    },
    {
      "id": "R25",
      "site": "SampleMart",
      "date": "2026-04-28",
      "rating": 5,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "Setup took ten minutes and the remote is simple to use. Picture quality is outstanding for movies.",
      "contexts": [
        "Movies and streaming"
      ],
      "hl": {
        "remote": [
          "Setup took ten minutes and the remote is simple to use."
        ],
        "setup": [
          "Setup took ten minutes and the remote is simple to use."
        ],
        "usability": [
          "Setup took ten minutes and the remote is simple to use."
        ],
        "picture": [
          "Picture quality is outstanding for movies."
        ]
      }
    },
    {
      "id": "R26",
      "site": "DemoShop",
      "date": "2026-05-17",
      "rating": 4,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "Viewing angles are excellent and colours stay accurate from the side of the room. The speakers are thin for movies, though fine for news.",
      "contexts": [
        "Movies and streaming",
        "Sports and live TV"
      ],
      "hl": {
        "picture": [
          "Viewing angles are excellent and colours stay accurate from the side of the room."
        ],
        "sound": [
          "The speakers are thin for movies, though fine for news."
        ]
      }
    },
    {
      "id": "R27",
      "site": "ShopLane",
      "date": "2026-06-02",
      "rating": 5,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "The game mode is superb. 144Hz with VRR on my Xbox is smooth and input lag feels instant.",
      "contexts": [
        "Gaming"
      ],
      "hl": {
        "gaming": [
          "The game mode is superb.",
          "144Hz with VRR on my Xbox is smooth and input lag feels instant."
        ]
      }
    },
    {
      "id": "R28",
      "site": "SampleMart",
      "date": "2026-06-20",
      "rating": 4,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "Bright enough in my living room during the day as long as the blinds are half closed. Contrast is excellent at night.",
      "contexts": [
        "Dark rooms and evenings"
      ],
      "hl": {
        "brightness": [
          "Bright enough in my living room during the day as long as the blinds are half closed."
        ],
        "picture": [
          "Contrast is excellent at night."
        ]
      }
    },
    {
      "id": "R29",
      "site": "DemoShop",
      "date": "2026-07-08",
      "rating": 3,
      "verified": true,
      "url": null,
      "sentiment": "mixed",
      "text": "The home screen ads are intrusive and the menus feel slow. The picture is great once you get to the content.",
      "contexts": [],
      "hl": {
        "smart": [
          "The home screen ads are intrusive and the menus feel slow."
        ],
        "picture": [
          "The picture is great once you get to the content."
        ]
      }
    },
    {
      "id": "R30",
      "site": "SampleMart",
      "date": "2026-07-26",
      "rating": 4,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "Great value for a 65-inch OLED on sale. Picture and gaming are both excellent.",
      "contexts": [
        "Gaming"
      ],
      "hl": {
        "value": [
          "Great value for a 65-inch OLED on sale."
        ],
        "picture": [
          "Picture and gaming are both excellent."
        ],
        "gaming": [
          "Picture and gaming are both excellent."
        ]
      }
    },
    {
      "id": "R31",
      "site": "ShopLane",
      "date": "2026-08-11",
      "rating": 2,
      "verified": true,
      "url": "https://example.com/shoplane/aria65/r31",
      "sentiment": "negative",
      "text": "The eARC audio still drops out with my soundbar even after the August update. Very frustrating.",
      "contexts": [],
      "hl": {
        "hdmi": [
          "The eARC audio still drops out with my soundbar even after the August update."
        ],
        "smart": [
          "The eARC audio still drops out with my soundbar even after the August update."
        ]
      }
    },
    {
      "id": "R32",
      "site": "DemoShop",
      "date": "2026-09-14",
      "rating": 5,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "The September firmware update fixed the eARC dropouts for me. The soundbar has been stable for two weeks.",
      "contexts": [],
      "hl": {
        "hdmi": [
          "The September firmware update fixed the eARC dropouts for me."
        ],
        "smart": [
          "The September firmware update fixed the eARC dropouts for me."
        ]
      }
    },
    {
      "id": "R33",
      "site": "SampleMart",
      "date": "2026-09-22",
      "rating": 4,
      "verified": true,
      "url": "https://example.com/samplemart/aria65/r33",
      "sentiment": "mixed",
      "text": "After eight months of daily use, mostly news and sports, I can see a faint retention of the channel logo on grey screens.",
      "contexts": [
        "Sports and live TV"
      ],
      "hl": {
        "burnin": [
          "After eight months of daily use, mostly news and sports, I can see a faint retention of the channel logo on grey screens."
        ]
      }
    },
    {
      "id": "R34",
      "site": "ShopLane",
      "date": "2026-10-03",
      "rating": 5,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "Seven months in with heavy gaming and no burn-in at all. The pixel refresh runs automatically when it is switched off.",
      "contexts": [
        "Gaming"
      ],
      "hl": {
        "burnin": [
          "Seven months in with heavy gaming and no burn-in at all."
        ],
        "gaming": [
          "Seven months in with heavy gaming and no burn-in at all."
        ]
      }
    },
    {
      "id": "R35",
      "site": "DemoShop",
      "date": "2026-10-08",
      "rating": 4,
      "verified": true,
      "url": null,
      "sentiment": "mixed",
      "text": "Great TV, but the built-in sound lacks bass. A soundbar fixed it.",
      "contexts": [],
      "hl": {
        "sound": [
          "Great TV, but the built-in sound lacks bass."
        ]
      }
    },
    {
      "id": "R36",
      "site": "SampleMart",
      "date": "2026-10-15",
      "rating": 4,
      "verified": true,
      "url": null,
      "sentiment": "positive",
      "text": "The remote is comfortable and responds instantly. Voice control works well.",
      "contexts": [],
      "hl": {
        "remote": [
          "The remote is comfortable and responds instantly."
        ],
        "smart": [
          "Voice control works well."
        ]
      }
    },
    {
      "id": "R37",
      "site": "DemoShop",
      "date": "2026-10-18",
      "rating": 3,
      "verified": true,
      "url": null,
      "sentiment": "mixed",
      "text": "The picture is beautiful at night, but in our sunny room the reflections from the window are hard to ignore during the day.",
      "contexts": [
        "Bright rooms",
        "Dark rooms and evenings"
      ],
      "hl": {
        "picture": [
          "The picture is beautiful at night, but in our sunny room the reflections from the window are hard to ignore during the day."
        ],
        "brightness": [
          "The picture is beautiful at night, but in our sunny room the reflections from the window are hard to ignore during the day."
        ]
      }
    }
  ],
  "panels": {
    "picture": {
      "title": "Picture quality",
      "theme": "picture",
      "groups": [
        {
          "label": "Positive",
          "ids": [
            "R1",
            "R2",
            "R5",
            "R8",
            "R16",
            "R17",
            "R20",
            "R21",
            "R23",
            "R25",
            "R26",
            "R28",
            "R29",
            "R30",
            "R37"
          ]
        },
        {
          "label": "Mixed",
          "ids": [
            "R13"
          ]
        },
        {
          "label": "Negative",
          "ids": [
            "R3"
          ]
        }
      ]
    },
    "gaming": {
      "title": "Gaming and refresh rate",
      "theme": "gaming",
      "groups": [
        {
          "label": "Positive",
          "ids": [
            "R4",
            "R16",
            "R23",
            "R27",
            "R30",
            "R34"
          ]
        }
      ]
    },
    "remote": {
      "title": "Remote control",
      "theme": "remote",
      "groups": [
        {
          "label": "Positive",
          "ids": [
            "R8",
            "R25",
            "R36"
          ]
        },
        {
          "label": "Negative",
          "ids": [
            "R18"
          ]
        }
      ]
    },
    "value": {
      "title": "Value for money",
      "theme": "value",
      "groups": [
        {
          "label": "Positive",
          "ids": [
            "R30"
          ]
        },
        {
          "label": "Mixed",
          "ids": [
            "R22"
          ]
        }
      ]
    },
    "usability": {
      "title": "Everyday ease of use",
      "theme": "usability",
      "groups": [
        {
          "label": "Positive",
          "ids": [
            "R25"
          ]
        }
      ]
    },
    "brightness": {
      "title": "Brightness and glare",
      "theme": "brightness",
      "groups": [
        {
          "label": "Positive",
          "ids": [
            "R20",
            "R28"
          ]
        },
        {
          "label": "Negative",
          "ids": [
            "R3",
            "R24",
            "R37"
          ]
        }
      ]
    },
    "smart": {
      "title": "Smart platform, apps and ads",
      "theme": "smart",
      "groups": [
        {
          "label": "Positive",
          "ids": [
            "R32",
            "R36"
          ]
        },
        {
          "label": "Negative",
          "ids": [
            "R5",
            "R18",
            "R19",
            "R21",
            "R29",
            "R31"
          ]
        }
      ]
    },
    "sound": {
      "title": "Built-in sound",
      "theme": "sound",
      "groups": [
        {
          "label": "Negative",
          "ids": [
            "R2",
            "R17",
            "R26",
            "R35"
          ]
        }
      ]
    },
    "hdmi": {
      "title": "HDMI, eARC and connections",
      "theme": "hdmi",
      "groups": [
        {
          "label": "Positive",
          "ids": [
            "R32"
          ]
        },
        {
          "label": "Negative",
          "ids": [
            "R18",
            "R19",
            "R21",
            "R31"
          ]
        }
      ]
    },
    "panel": {
      "title": "Panel defects",
      "theme": "panel",
      "groups": [
        {
          "label": "Negative",
          "ids": [
            "R7",
            "R13"
          ]
        }
      ]
    },
    "motion": {
      "title": "Motion and upscaling",
      "theme": "motion",
      "groups": [
        {
          "label": "Negative",
          "ids": [
            "R9"
          ]
        }
      ]
    },
    "d_burnin": {
      "title": "Burn-in",
      "theme": "burnin",
      "groups": [
        {
          "label": "No burn-in so far",
          "ids": [
            "R23",
            "R34"
          ]
        },
        {
          "label": "Logo retention appeared",
          "ids": [
            "R15",
            "R33"
          ]
        }
      ]
    },
    "d_brightness": {
      "title": "Brightness in bright rooms",
      "theme": "brightness",
      "groups": [
        {
          "label": "Bright enough",
          "ids": [
            "R20",
            "R28"
          ]
        },
        {
          "label": "Too dim or reflective",
          "ids": [
            "R3",
            "R24",
            "R37"
          ]
        }
      ]
    },
    "d_smart": {
      "title": "Smart platform",
      "theme": "smart",
      "groups": [
        {
          "label": "Works well",
          "ids": [
            "R32",
            "R36"
          ]
        },
        {
          "label": "Frustrating",
          "ids": [
            "R5",
            "R18",
            "R19",
            "R21",
            "R29",
            "R31"
          ]
        }
      ]
    },
    "h_earc": {
      "title": "Soundbar audio drops out over eARC",
      "theme": "hdmi",
      "groups": [
        {
          "label": "Reported",
          "ids": [
            "R18",
            "R19",
            "R21",
            "R31"
          ]
        }
      ]
    },
    "h_retention": {
      "title": "Channel-logo image retention",
      "theme": "burnin",
      "groups": [
        {
          "label": "Reported",
          "ids": [
            "R15",
            "R33"
          ]
        }
      ]
    },
    "h_ads": {
      "title": "Ads on the home screen",
      "theme": "smart",
      "groups": [
        {
          "label": "Reported",
          "ids": [
            "R5",
            "R29"
          ]
        }
      ]
    },
    "h_banding": {
      "title": "Banding in dark scenes",
      "theme": "panel",
      "groups": [
        {
          "label": "Reported",
          "ids": [
            "R13"
          ]
        }
      ]
    }
  },
  "ask": {
    "suggestions": [
      "I have a bright living room",
      "I mostly play games",
      "I watch a lot of news and sports",
      "I use a soundbar"
    ],
    "topics": [
      {
        "pattern": "bright|sun|window|daylight|glare|reflect|lit room",
        "themes": [
          "brightness"
        ],
        "context": "Bright rooms",
        "note": "Owners who can control daylight, with blinds or the anti-glare screen, are happier than those with direct sun on the screen."
      },
      {
        "pattern": "gam|ps5|xbox|console|vrr|input lag|\\b1[24]4? ?hz",
        "themes": [
          "gaming"
        ],
        "context": "Gaming"
      },
      {
        "pattern": "sport|news|football|cricket|match|channel|logo|burn|cable|broadcast",
        "themes": [
          "burnin",
          "motion"
        ],
        "context": "Sports and live TV",
        "note": "Both image-retention reports come from heavy news and sports viewing with static channel logos; heavy gamers report none."
      },
      {
        "pattern": "movie|film|netflix|stream|hdr|dark room|picture|black|contrast",
        "themes": [
          "picture"
        ],
        "context": "Movies and streaming"
      },
      {
        "pattern": "sound|speaker|soundbar|dialog|audio|earc|hdmi|bass",
        "themes": [
          "sound",
          "hdmi"
        ]
      },
      {
        "pattern": "\\bads?\\b|advert|apps?\\b|smart|menu|update|firmware|software|voice",
        "themes": [
          "smart"
        ]
      },
      {
        "pattern": "price|value|worth|cost|expensive|money|budget",
        "themes": [
          "value"
        ]
      }
    ],
    "themePanels": {
      "burnin": "d_burnin"
    }
  }
};

module.exports = (req, res) => {
  const q = String((req.query && req.query.q) || "").trim();
  if (!q) {
    res.status(400).json({ error: "Enter a product name or link." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(Object.assign({ query: q }, SAMPLE));
};
