/**
 * GENERATED from schema/lesson.schema.json and
 * schema/content-manifest.schema.json via scripts/generate-schema-module.mjs.
 * DO NOT EDIT: edit the schema, then run `make sync-types`.
 *
 * The structural layer (validate.ts) compiles these, so no module under the
 * package root reads a file at run time (engine#203). Annotation keywords
 * (description, title, $comment) are left out: they never change what a
 * schema accepts. The JSON files keep them.
 */

/** schema/lesson.schema.json, without its annotations */
export const LESSON_SCHEMA: object = {
  "$defs": {
    "Card": {
      "additionalProperties": false,
      "properties": {
        "audio": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "back": {
          "maxLength": 500,
          "minLength": 1,
          "type": "string"
        },
        "code_language": {
          "anyOf": [
            {
              "maxLength": 30,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "code_snippet": {
          "anyOf": [
            {
              "maxLength": 5000,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "difficulty": {
          "anyOf": [
            {
              "maximum": 5,
              "minimum": 1,
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "expected_output": {
          "anyOf": [
            {
              "maxLength": 2000,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "front": {
          "maxLength": 500,
          "minLength": 1,
          "type": "string"
        },
        "hint": {
          "anyOf": [
            {
              "maxLength": 1000,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "id": {
          "$ref": "#/$defs/SlugId"
        },
        "stable_id": {
          "anyOf": [
            {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9_-]{7,63}$"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "image": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "media_type": {
          "anyOf": [
            {
              "enum": [
                "text",
                "code",
                "formula",
                "diagram"
              ],
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "notes": {
          "anyOf": [
            {
              "maxLength": 2000,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "tags": {
          "default": [],
          "items": {
            "$ref": "#/$defs/SlugId"
          },
          "maxItems": 20,
          "type": "array"
        },
        "token_roles": {
          "anyOf": [
            {
              "items": {
                "$ref": "#/$defs/CardTokenRole"
              },
              "maxItems": 10,
              "type": "array"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        }
      },
      "required": [
        "id",
        "front",
        "back"
      ],
      "type": "object"
    },
    "CardTokenRole": {
      "additionalProperties": false,
      "properties": {
        "role": {
          "$ref": "#/$defs/TokenRole"
        },
        "token": {
          "maxLength": 120,
          "minLength": 1,
          "type": "string"
        }
      },
      "required": [
        "token",
        "role"
      ],
      "type": "object"
    },
    "ClozeBlank": {
      "additionalProperties": false,
      "properties": {
        "accept": {
          "items": {
            "type": "string"
          },
          "minItems": 1,
          "type": "array"
        },
        "hint": {
          "anyOf": [
            {
              "maxLength": 200,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "placeholder": {
          "anyOf": [
            {
              "maxLength": 40,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "stable_id": {
          "anyOf": [
            {
              "$ref": "#/$defs/SlugId"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        }
      },
      "required": [
        "accept"
      ],
      "type": "object"
    },
    "Exercise": {
      "additionalProperties": false,
      "properties": {
        "accept": {
          "anyOf": [
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "accept_orderings": {
          "anyOf": [
            {
              "items": {
                "items": {
                  "type": "integer"
                },
                "type": "array"
              },
              "type": "array"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "blanks": {
          "anyOf": [
            {
              "items": {
                "$ref": "#/$defs/ClozeBlank"
              },
              "type": "array"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "card_ids": {
          "default": [],
          "items": {
            "type": "string"
          },
          "maxItems": 50,
          "type": "array"
        },
        "cloze_mode": {
          "anyOf": [
            {
              "enum": [
                "type",
                "select",
                "multiselect"
              ],
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "direction": {
          "default": "target_to_source",
          "enum": [
            "source_to_target",
            "target_to_source",
            "both",
            "random"
          ],
          "type": "string"
        },
        "distractors": {
          "default": [],
          "items": {
            "type": "string"
          },
          "maxItems": 20,
          "type": "array"
        },
        "examples": {
          "anyOf": [
            {
              "items": {
                "$ref": "#/$defs/InlineExample"
              },
              "maxItems": 20,
              "type": "array"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "explanation": {
          "anyOf": [
            {
              "maxLength": 2000,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "ext_payload": {
          "additionalProperties": true,
          "type": "object"
        },
        "from_cards": {
          "default": false,
          "type": "boolean"
        },
        "hint": {
          "anyOf": [
            {
              "maxLength": 1000,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "id": {
          "$ref": "#/$defs/SlugId"
        },
        "stable_id": {
          "anyOf": [
            {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9_-]{7,63}$"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "images": {
          "anyOf": [
            {
              "items": {
                "$ref": "#/$defs/PictureImage"
              },
              "type": "array"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "multiple": {
          "default": false,
          "type": "boolean"
        },
        "options": {
          "anyOf": [
            {
              "items": {
                "$ref": "#/$defs/MultipleChoiceOption"
              },
              "maxItems": 20,
              "type": "array"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "pairs": {
          "anyOf": [
            {
              "items": {
                "$ref": "#/$defs/Pair"
              },
              "type": "array"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "prompt": {
          "maxLength": 1000,
          "minLength": 1,
          "type": "string"
        },
        "sentence": {
          "anyOf": [
            {
              "maxLength": 1000,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "tiles": {
          "anyOf": [
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "type": {
          "anyOf": [
            {
              "$ref": "#/$defs/ExerciseType"
            },
            {
              "$ref": "#/$defs/ExtExerciseType"
            }
          ]
        },
        "variables": {
          "anyOf": [
            {
              "items": {
                "$ref": "#/$defs/ExerciseVariable"
              },
              "maxItems": 20,
              "minItems": 1,
              "type": "array"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        }
      },
      "required": [
        "id",
        "type",
        "prompt"
      ],
      "type": "object"
    },
    "ExerciseType": {
      "enum": [
        "matching",
        "picture_choice",
        "free_text",
        "word_tiles",
        "cloze",
        "multiple_choice"
      ],
      "type": "string"
    },
    "ExerciseVariable": {
      "additionalProperties": false,
      "properties": {
        "name": {
          "maxLength": 32,
          "pattern": "^[a-z][a-z0-9_]*$",
          "type": "string"
        },
        "min": {
          "type": "number"
        },
        "max": {
          "type": "number"
        },
        "step": {
          "exclusiveMinimum": 0,
          "type": "number"
        },
        "expression": {
          "maxLength": 200,
          "minLength": 1,
          "type": "string"
        },
        "tolerance": {
          "minimum": 0,
          "type": "number"
        }
      },
      "required": [
        "name"
      ],
      "type": "object"
    },
    "ExtExerciseType": {
      "pattern": "^ext:[a-z0-9]+-[a-z0-9-]+$",
      "type": "string"
    },
    "InlineExample": {
      "additionalProperties": false,
      "properties": {
        "content": {
          "maxLength": 5000,
          "minLength": 1,
          "type": "string"
        },
        "language": {
          "anyOf": [
            {
              "maxLength": 30,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "title": {
          "anyOf": [
            {
              "maxLength": 200,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        }
      },
      "required": [
        "content"
      ],
      "type": "object"
    },
    "LessonResource": {
      "additionalProperties": false,
      "properties": {
        "author": {
          "anyOf": [
            {
              "maxLength": 300,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "description": {
          "anyOf": [
            {
              "maxLength": 2000,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "duration": {
          "anyOf": [
            {
              "maxLength": 40,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "free": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "language": {
          "anyOf": [
            {
              "maxLength": 35,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "level": {
          "anyOf": [
            {
              "maxLength": 10,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "partnership": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "tags": {
          "anyOf": [
            {
              "items": {
                "type": "string"
              },
              "maxItems": 20,
              "type": "array"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "title": {
          "maxLength": 300,
          "minLength": 1,
          "type": "string"
        },
        "type": {
          "maxLength": 40,
          "minLength": 1,
          "type": "string"
        },
        "url": {
          "maxLength": 2000,
          "minLength": 1,
          "type": "string"
        }
      },
      "required": [
        "type",
        "title",
        "url"
      ],
      "type": "object"
    },
    "LessonStep": {
      "additionalProperties": false,
      "properties": {
        "body": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "example_label": {
          "anyOf": [
            {
              "maxLength": 200,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "example_url": {
          "anyOf": [
            {
              "maxLength": 2000,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "examples": {
          "anyOf": [
            {
              "items": {
                "$ref": "#/$defs/InlineExample"
              },
              "maxItems": 20,
              "type": "array"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "exercise": {
          "anyOf": [
            {
              "$ref": "#/$defs/Exercise"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "id": {
          "$ref": "#/$defs/SlugId"
        },
        "review_lesson_id": {
          "anyOf": [
            {
              "maxLength": 200,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "theory_ref": {
          "anyOf": [
            {
              "maxLength": 200,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "title": {
          "anyOf": [
            {
              "maxLength": 200,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "type": {
          "$ref": "#/$defs/StepType"
        }
      },
      "required": [
        "id",
        "type"
      ],
      "type": "object"
    },
    "MultipleChoiceOption": {
      "additionalProperties": false,
      "properties": {
        "correct": {
          "default": false,
          "type": "boolean"
        },
        "stable_id": {
          "anyOf": [
            {
              "$ref": "#/$defs/SlugId"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "text": {
          "maxLength": 500,
          "minLength": 1,
          "type": "string"
        }
      },
      "required": [
        "text"
      ],
      "type": "object"
    },
    "Pair": {
      "additionalProperties": false,
      "properties": {
        "left": {
          "maxLength": 500,
          "minLength": 1,
          "type": "string"
        },
        "right": {
          "maxLength": 500,
          "minLength": 1,
          "type": "string"
        },
        "stable_id": {
          "anyOf": [
            {
              "$ref": "#/$defs/SlugId"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        }
      },
      "required": [
        "left",
        "right"
      ],
      "type": "object"
    },
    "PictureImage": {
      "additionalProperties": false,
      "properties": {
        "is_correct": {
          "anyOf": [
            {
              "maxLength": 10,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "label": {
          "maxLength": 500,
          "minLength": 1,
          "type": "string"
        },
        "src": {
          "anyOf": [
            {
              "maxLength": 500,
              "minLength": 1,
              "type": "string"
            },
            {
              "maxLength": 250000,
              "pattern": "^data:image/[a-z0-9.+-]+;base64,",
              "type": "string"
            }
          ]
        }
      },
      "required": [
        "src",
        "label"
      ],
      "type": "object"
    },
    "SlugId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120,
      "pattern": "^[\\p{Ll}\\p{Nd}]+(-[\\p{Ll}\\p{Nd}]+)*$"
    },
    "StepType": {
      "enum": [
        "theory",
        "exercise"
      ],
      "type": "string"
    },
    "TokenRole": {
      "enum": [
        "article",
        "verb",
        "noun",
        "adjective",
        "preposition",
        "gender_marker",
        "tense_marker"
      ],
      "type": "string"
    }
  },
  "$id": "https://astrapi69.github.io/learn-content-engine/schema/lesson.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false,
  "properties": {
    "cards": {
      "default": [],
      "items": {
        "$ref": "#/$defs/Card"
      },
      "type": "array"
    },
    "contributed_at": {
      "anyOf": [
        {
          "maxLength": 40,
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "default": null
    },
    "contributed_by": {
      "anyOf": [
        {
          "maxLength": 200,
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "default": null
    },
    "description": {
      "anyOf": [
        {
          "maxLength": 500,
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "default": null
    },
    "domain": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "default": null
    },
    "estimated_minutes": {
      "default": 10,
      "maximum": 240,
      "minimum": 1,
      "type": "integer"
    },
    "id": {
      "$ref": "#/$defs/SlugId"
    },
    "purpose": {
      "default": "practice",
      "enum": [
        "practice",
        "bridge",
        "quiz"
      ],
      "type": "string"
    },
    "requires_extensions": {
      "items": {
        "pattern": "^ext:[a-z0-9]+-[a-z0-9-]+@\\d+$",
        "type": "string"
      },
      "type": "array"
    },
    "resources": {
      "anyOf": [
        {
          "items": {
            "$ref": "#/$defs/LessonResource"
          },
          "type": "array"
        },
        {
          "type": "null"
        }
      ],
      "default": null
    },
    "source_language": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "default": null
    },
    "steps": {
      "items": {
        "$ref": "#/$defs/LessonStep"
      },
      "minItems": 1,
      "type": "array"
    },
    "target_language": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "default": null
    },
    "title": {
      "maxLength": 200,
      "minLength": 1,
      "type": "string"
    },
    "variation_note": {
      "anyOf": [
        {
          "maxLength": 500,
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "default": null
    },
    "variation_of": {
      "anyOf": [
        {
          "maxLength": 120,
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "default": null
    }
  },
  "required": [
    "id",
    "title",
    "steps"
  ],
  "type": "object",
  "x-schema-version": "1.18"
};

/** schema/content-manifest.schema.json, without its annotations */
export const CONTENT_MANIFEST_SCHEMA: object = {
  "$defs": {
    "ContentSet": {
      "additionalProperties": false,
      "properties": {
        "assets": {
          "default": [],
          "items": {
            "$ref": "#/$defs/ContentSetAsset"
          },
          "maxItems": 500,
          "type": "array"
        },
        "book": {
          "anyOf": [
            {
              "$ref": "#/$defs/ContentSetBook"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "cover_image": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "description": {
          "anyOf": [
            {
              "maxLength": 2000,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "domain": {
          "default": "language",
          "maxLength": 60,
          "minLength": 1,
          "type": "string"
        },
        "domain_label": {
          "anyOf": [
            {
              "maxLength": 120,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "id": {
          "maxLength": 120,
          "minLength": 1,
          "type": "string"
        },
        "lesson_count": {
          "maximum": 10000,
          "minimum": 0,
          "type": "integer"
        },
        "level": {
          "maxLength": 20,
          "minLength": 1,
          "type": "string"
        },
        "path": {
          "anyOf": [
            {
              "maxLength": 300,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "source_language": {
          "default": "en",
          "type": "string"
        },
        "tags": {
          "default": [],
          "items": {
            "type": "string"
          },
          "maxItems": 20,
          "type": "array"
        },
        "target_language": {
          "type": "string"
        },
        "title": {
          "maxLength": 200,
          "minLength": 1,
          "type": "string"
        },
        "title_native": {
          "anyOf": [
            {
              "maxLength": 200,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "version": {
          "type": "string"
        },
        "visibility": {
          "default": "visible",
          "enum": [
            "visible",
            "hidden"
          ],
          "type": "string"
        },
        "attribution": {
          "anyOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "author"
              ],
              "properties": {
                "author": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 120
                },
                "derived_from": {
                  "type": "array",
                  "maxItems": 8,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "author"
                    ],
                    "properties": {
                      "author": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 120
                      }
                    }
                  }
                }
              }
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "review_status": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "authored",
                "generated",
                "reviewed"
              ]
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "evaluation": {
          "anyOf": [
            {
              "$ref": "#/$defs/ContentSetEvaluation"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        }
      },
      "required": [
        "id",
        "title",
        "target_language",
        "level",
        "version",
        "lesson_count"
      ],
      "type": "object"
    },
    "ContentSetAsset": {
      "additionalProperties": false,
      "properties": {
        "path": {
          "maxLength": 300,
          "minLength": 1,
          "type": "string"
        },
        "size_kb": {
          "maximum": 500,
          "minimum": 1,
          "type": "integer"
        }
      },
      "required": [
        "path",
        "size_kb"
      ],
      "type": "object"
    },
    "ContentSetBook": {
      "properties": {
        "asin": {
          "anyOf": [
            {
              "maxLength": 20,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "author": {
          "anyOf": [
            {
              "maxLength": 300,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "title": {
          "maxLength": 300,
          "minLength": 1,
          "type": "string"
        },
        "url": {
          "anyOf": [
            {
              "maxLength": 2000,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        }
      },
      "required": [
        "title"
      ],
      "type": "object"
    },
    "ContentSetEvaluation": {
      "additionalProperties": false,
      "properties": {
        "scheme": {
          "default": "percent",
          "enum": [
            "percent",
            "pass_fail",
            "grades"
          ]
        },
        "pass_percent": {
          "maximum": 100,
          "minimum": 0,
          "type": "integer"
        },
        "basis": {
          "default": "elements",
          "enum": [
            "elements"
          ]
        },
        "grades": {
          "items": {
            "$ref": "#/$defs/ContentSetGrade"
          },
          "minItems": 2,
          "type": "array"
        },
        "report": {
          "default": "compact",
          "enum": [
            "compact",
            "detailed"
          ]
        },
        "title": {
          "minLength": 1,
          "type": "string"
        }
      },
      "type": "object"
    },
    "ContentSetGrade": {
      "additionalProperties": false,
      "properties": {
        "min_percent": {
          "maximum": 100,
          "minimum": 0,
          "type": "integer"
        },
        "label": {
          "minLength": 1,
          "type": "string"
        },
        "label_native": {
          "minLength": 1,
          "type": "string"
        }
      },
      "required": [
        "min_percent",
        "label"
      ],
      "type": "object"
    }
  },
  "$id": "https://astrapi69.github.io/learn-content-engine/schema/content-manifest.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false,
  "properties": {
    "description": {
      "anyOf": [
        {
          "maxLength": 2000,
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "default": null
    },
    "metadata": {
      "additionalProperties": true,
      "default": {},
      "type": "object"
    },
    "name": {
      "maxLength": 200,
      "minLength": 1,
      "type": "string"
    },
    "schema_version": {
      "default": "1.7",
      "type": "string"
    },
    "sets": {
      "default": [],
      "items": {
        "$ref": "#/$defs/ContentSet"
      },
      "type": "array"
    }
  },
  "required": [
    "name"
  ],
  "type": "object",
  "x-schema-version": "1.18"
};
