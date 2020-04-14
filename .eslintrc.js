module.exports = {
  "parserOptions": {
    "ecmaVersion": 2019,
    "sourceType": "module"
  },
  extends: [
    'plugin:prettier/recommended'
  ],
  rules: {
    "prettier/prettier": [
      "error",
        {
        "singleQuote": true,
        "endOfLine": "auto"
        }
    ]
  }
};
