#!/usr/bin/env ts-node

import Web3 from 'web3';
import axios from 'axios';
import fs from 'fs';


//必填
const mainPrivateKey = '0x32516db1176b442753b3a514bb5dd2510d6b231139dec472f448cb6665bcf91b';
const apiUrl = 'https://api.qna3.ai/api/v2';
const apiDefaultUrl = 'https://api.qna3.ai';

const contractAddress = '0xb342e7d33b806544609370271a8d074313b7bc30';
const inputData = '0xe95a644f0000000000000000000000000000000000000000000000000000000000000001';
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

const web3 = new Web3('https://opbnb-mainnet-rpc.bnbchain.org');

//选填
let inviteCode = 'ttjRpga3';
let count = 0

async function transferBNB(fromAddress: string, privateKey: string, toAddress: string, amount: number) {
  const tx = {
    from: fromAddress,
    to: toAddress,
    value: web3.utils.toWei(amount.toString(), 'ether'),
    gas: 21000,
    gasPrice : 10,
  };

  const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
  return web3.eth.sendSignedTransaction(signedTx.rawTransaction!);
}

async function signMessage(address: string, privateKey: string, message: string) {
  const signature = await web3.eth.accounts.sign(message, privateKey);
  return signature.signature;
}

async function callApi(method: string, endpoint: string, data: any, headers: any) {
  const response = await axios({
    method,
    url: `${apiUrl}${endpoint}`,
    data,
    headers,
  });
  return response;
}
async function callDefaultApi(method: string, endpoint: string, data: any, headers: any) {
  const response = await axios({
    method,
    url: `${apiDefaultUrl}${endpoint}`,
    data,
    headers,
  });
  return response;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function initialize() {
  
  while (true) {

    try {
      const account = web3.eth.accounts.create();
      const mainACcount = web3.eth.accounts.privateKeyToAccount(mainPrivateKey)
      await transferBNB(mainACcount.address, mainACcount.privateKey, account.address, 0.002);
      fs.appendFileSync('accounts.txt', `${account.address}, ${account.privateKey}\n`);

      const loginResponse = await login(account);
      if (loginResponse.data.statusCode === 200) {      
        
        const receipt = await checkInOnChain(account)
        
        try{
          await checkIn(loginResponse.data.data.accessToken,receipt.transactionHash)
        }catch(error){
          console.log(error)
        }

        await credit(loginResponse.data.data.accessToken);

        const userDetail = loginResponse.data.data.user
        const userDetailGrahql = await postUserDetatil(loginResponse.data.data.accessToken, userDetail.id)
        await vote(loginResponse.data.data.accessToken, userDetail.id)
        
        if(count == 19){
          //every 20 time update the count
          count = 0
          //update invite code
          inviteCode = userDetailGrahql.invitation.code
          console.log(`invite code update,  address: ${inviteCode}, address: ${account.address}, privkey: ${account.privateKey}`)
        }else{
          count++
        }

        // 等待3秒
        await delay(2000);
      }else{
        console.error(`Error occurred: statusCode error: ${loginResponse}`);
      }
    } catch (error) {
      console.error('Error occurred:', error);
    }
  }
}

async function checkInOnChain(account) {
      const tx = {
              from: account.address,
              to: contractAddress,
              value: 0,
              gas: 100000,
              asPrice : 10,
              data: inputData,
            };

        const signedTx = await web3.eth.accounts.signTransaction(tx, account.privateKey);
        console.log(`sign tx ${signedTx.messageHash}.`)
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction!);
        console.log(`sent tx ${receipt.transactionHash}, ${receipt.status}.`)
        return receipt
}

async function checkIn(accessToken,txHash){
    let checkInResponse;
    do {
      await new Promise(resolve => setTimeout(resolve, 3000));
      checkInResponse = await callApi('post', '/my/check-in', {
        hash: txHash,
        via: 'opbnb',
      }, {
        'User-Agent': userAgent,
        'Authorization':`Bearer ${accessToken}`
      });
    } while (checkInResponse.status !== 200);
}


async function login(account) {
      const message = 'AI + DYOR = Ultimate Answer to Unlock Web3 Universe';
      const signature = await signMessage(account.address, account.privateKey, message);
      console.log(`sign message ${signature}.`)

      const loginResponse = await callApi('post', '/auth/login?via=wallet', {
        invite_code: inviteCode,
        signature,
        wallet_address: account.address,
      }, {
        'User-Agent': userAgent,
      });
      console.log(`invited with invite code: ${inviteCode}`)
      return loginResponse
}

async function credit(accessToken){
  const creditResponse = await callDefaultApi('post', `/search/?t=${new Date().getTime()}`, {
    originalQuery: "Why did the price of ORDI fall?",
    query: "Why did the price of ORDI fall?"
  }, {
    'User-Agent': userAgent,
    'Authorization':`Bearer ${accessToken}`
  });
  console.log(creditResponse.data)
}

async function postUserDetatil(accessToken, userId) {
  // 设置请求体 payload
const data = {
  query: `query loadUserDetail($cursored: CursoredRequestInput!) {
      userDetail {
          checkInStatus {
              checkInDays
              todayCount
          }
          credit
          creditHistories(cursored: $cursored) {
              cursorInfo {
                  endCursor
                  hasNextPage
              }
              items {
                  claimed
                  extra
                  id
                  score
                  signDay
                  signInId
                  txHash
                  typ
              }
              total
          }
          invitation {
              code
              inviteeCount
              leftCount
          }
          origin {
              email
              id
              internalAddress
              userWalletAddress
          }
          externalCredit
          voteHistoryOfCurrentActivity {
              created_at
              query
          }
          ambassadorProgram {
              bonus
              claimed
              family {
                  checkedInUsers
                  totalUsers
              }
          }
      }
  }`,
  variables: {
      headersMapping: {
          "x-lang": "english",
          "x-id": `${userId}`,
          "Authorization": `Bearer ${accessToken}`
      },
      cursored: {
          "after": "",
          "first": 20
      }
  }
};
  const  userDetailResponse = await callApi('post', `/graphql`, data, {
    'User-Agent': userAgent,
    'Authorization':`Bearer ${accessToken}`
  });
  console.log(userDetailResponse.data.data.userDetail.invitation.code)
  return userDetailResponse.data.data.userDetail
}

async function vote(accessToken,userId){
  const voteResponse = await callDefaultApi('post', '/search/vote', {
    answer: `{"knowledge":"The price of ORDI fell due to a variety of factors, including market volatility, influential statements, and whale activity. Here are the key reasons for the price decline:\\n\\n- **Market Volatility and Liquidations**: The altcoin market, including ORDI, experienced significant turbulence and high liquidations[^1^]. This volatility led to a sudden decline in the price of ORDI.\\n\\n- **Influential Statements**: Influential statements from prominent figures, such as Bitcoin Core developer Luke Dashjr, have had a notable impact on the price of ORDI[^7^]. For instance, Dashjr's comments led to a transient price shift, resulting in substantial losses for long traders within a short timeframe[^7^].\\n\\n- **Whale Activity**: The actions of major ORDI holders, particularly whales, have also influenced the market. Analysis has revealed that a small group of whales holds a significant portion of ORDI, and their accumulation or selling activities have impacted the market[^6^].\\n\\n- **Market Speculation**: The creation of the first daily bearish candlestick after a continuous streak of bullish ones has ignited speculation about the future trajectory of ORDI, raising questions about whether it signals a sustained trend or hints at a potential correction before achieving a new all-time high[^4^].\\n\\nThese factors collectively contributed to the decline in the price of ORDI.\\n\\n[^1^]: [Benzinga](https://www.benzinga.com/markets/cryptocurrency/23/12/36087872/over-335m-liquidated-bitcoin-ether-bigtime-ordi-tokens-sweep-away-traders-dreams?utm_source&#x3D;snapi)\\n[^4^]: [CryptosHeadlines](https://cryptosheadlines.com/ordi-price-hits-new-all-time-high/?utm_source&#x3D;snapi)\\n[^6^]: [Coinpedia](https://coinpedia.org/price-analysis/ordinals-ordi-price-hit-all-time-high-what-next/)\\n[^7^]: [TheCurrencyAnalytics](https://thecurrencyanalytics.com/bitcoin/bitcoin-linked-ordi-tokens-price-dive-following-developers-bug-claim-impact-and-future-prospects-85021.php)"}`,
    question: "Why did the price of ORDI fall?",
    vote_type: "upvote"
  }, {
    'User-Agent': userAgent,
    'X-Id': userId,
    'Authorization': `Bearer ${accessToken}`,
    'Accept-Encoding': "gzip, deflate, br"
  });
  
  console.log('voted');
  
}

initialize();
