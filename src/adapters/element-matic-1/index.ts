import * as dotenv from "dotenv";

dotenv.config();

import moment from "moment";
import { EventData } from "web3-eth-contract";
import path from "path";
import Matic from "../../sdk/matic";
import { ISaleEntity } from "../../sdk/Interfaces";
import getPaymentData from "../../sdk/utils/getPaymentData";

class Element {
    name: string;
    protocol: string;
    block: number;
    deprecatedAtBlock: number;
    contract: string;
    events: string[];
    pathToAbi: string;
    range: number;
    chunkSize: number;
    sdk: any;

    constructor() {
        this.name = "element-matic-1";
        this.protocol = "matic";
        this.block = 27991079;
        this.deprecatedAtBlock = 34601844;
        this.contract = "0xeaf5453b329eb38be159a872a6ce91c9a8fb0260";
        this.events = [
            "ERC721SellOrderFilled",
            "ERC721BuyOrderFilled",
            "ERC1155SellOrderFilled",
            "ERC1155BuyOrderFilled",
        ];
        this.pathToAbi = path.join(__dirname, "./abi.json");
        this.range = 500;
        this.chunkSize = 6;
    }

    run = async (): Promise<void> => {
        this.sdk = await this.loadSdk();

        await this.sdk.run();
    };

    loadSdk = (): any => {
        return new Matic(this);
    };

    stop = async (): Promise<void> => {
        this.sdk.stop();
    };

    _getToken = (event: EventData): string => {
        let token = event.returnValues["erc20Token"].toLowerCase();

        if (token === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
            token = "matic";
        }

        return token;
    };

    process = async (event: EventData): Promise<void> => {
        const isER721 = event.event === "ERC721SellOrderFilled" || event.event === "ERC721BuyOrderFilled";
        const isSellOrder = ["ERC721SellOrderFilled", "ERC1155SellOrderFilled"].includes(event.event);
        const block = await this.sdk.getBlock(event.blockNumber);
        const timestamp = moment.unix(block.timestamp).utc();
        const paymentToken = this._getToken(event);
        const amount = isER721 ? 1 : event.returnValues["erc1155FillAmount"];
        const nativePrice = isER721 ? event.returnValues["erc20TokenAmount"] : event.returnValues["erc20FillAmount"];
        const maker = event.returnValues["maker"];
        const taker = event.returnValues["taker"];
        const buyer = isSellOrder ? taker : maker;
        const seller = isSellOrder ? maker : taker;
        const nftContract = event.returnValues["erc721Token"] || event.returnValues["erc1155Token"];
        const tokenId = event.returnValues["erc721TokenId"] || event.returnValues["erc1155TokenId"];
        const { paymentTokenSymbol, priceInCrypto, priceInUsd } = await getPaymentData(
            this.protocol,
            paymentToken,
            nativePrice,
            timestamp,
        );

        const entity = {
            providerName: this.name,
            providerContract: this.contract,
            protocol: this.protocol,
            nftContract: nftContract.toLowerCase(),
            nftId: tokenId,
            token: paymentToken,
            tokenSymbol: paymentTokenSymbol,
            amount,
            price: priceInCrypto,
            priceUsd: priceInUsd,
            seller: seller.toLowerCase(),
            buyer: buyer.toLowerCase(),
            soldAt: timestamp.format("YYYY-MM-DD HH:mm:ss"),
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
        };

        await this.addToDatabase(entity);
    };

    addToDatabase = async (entity: ISaleEntity): Promise<ISaleEntity> => {
        console.log(`creating sale for ${entity.nftContract} with id ${entity.nftId}`);
        return entity;
    };
}

export default Element;
