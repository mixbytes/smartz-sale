pragma solidity 0.4.18;

interface IEmissionPartMinter {
    function mintPartOfEmission(address to, uint part, uint partOfEmissionForPublicSales) public;
}
