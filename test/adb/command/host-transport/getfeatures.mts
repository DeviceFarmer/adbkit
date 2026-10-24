import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import MockConnection from '../../../mock/connection.mts';
import ProtocolModule from '../../../../dist/src/adb/protocol.js';
import GetFeaturesCommandModule from '../../../../dist/src/adb/command/host-transport/getfeatures.js';

const Protocol = ProtocolModule.default;
const GetFeaturesCommand = GetFeaturesCommandModule.default;

describe('GetFeaturesCommand', function () {
  it("should send 'pm list features'", function () {
    const conn = new MockConnection();
    const cmd = new GetFeaturesCommand(conn);
    conn.getSocket().on('write', function (chunk) {
      return expect(chunk.toString()).to.equal(Protocol.encodeData('shell:pm list features 2>/dev/null').toString());
    });
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      return conn.getSocket().causeEnd();
    });
    return cmd.execute();
  });
  it('should return an empty object for an empty feature list', function () {
    const conn = new MockConnection();
    const cmd = new GetFeaturesCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      return conn.getSocket().causeEnd();
    });
    return cmd.execute().then(function (features) {
      expect(Object.keys(features)).to.be.empty;
    });
  });
  return it('should return a map of features', function () {
    const conn = new MockConnection();
    const cmd = new GetFeaturesCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(`feature:reqGlEsVersion=0x20000
feature:foo\r
feature:bar`);
      return conn.getSocket().causeEnd();
    });
    return cmd.execute().then(function (features) {
      expect(Object.keys(features)).to.have.length(3);
      expect(features).to.eql({
        reqGlEsVersion: '0x20000',
        foo: true,
        bar: true,
      });
    });
  });
});
